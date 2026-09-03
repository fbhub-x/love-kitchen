const api = require('../../utils/api');
const nav = require('../../utils/nav');

Page({
  data: {
    userInfo: {},
    partner: null,
    role: '',
    roleText: '用户',
    loginInfoText: '--',
    isAvatarUrl: false,
    isPartnerAvatarUrl: false,
    showUnbindAnim: false,
    emojiList: [
      '👩‍🦰', '👨‍🍳', '🐱', '🐰', '🐻', '🦊',
      '🐼', '🐨', '🦁', '🐯', '🐸', '🐵',
      '🦄', '🐝', '🦋', '🌸', '☀️', '🌙'
    ],
    // 编辑个人信息
    showEditModal: false,
    editAvatar: '',
    editNickname: '',
    _partnerPollTimer: null,
    // 修改密码
    showChangePwdModal: false,
    pwdStep: 1,
    oldPwd: '',
    newPwd: '',
    confirmPwd: '',
    pwdFocused: false,
    keyboardHeight: 0
  },

  onLoad() {
    const app = getApp();
    const userInfo = app.globalData.userInfo || {};
    const role = app.globalData.role || 'girl';
    const roleText = role === 'boy' ? '厨师' : (role === 'girl' ? '点餐方' : '用户');
    const isAvatarUrl = this.checkIsUrl(userInfo.avatar);
    this.setData({ userInfo, role, roleText, isAvatarUrl });

    // 显示登录信息（手机号）
    const phone = app.globalData.userPhone || userInfo.phone || '';
    if (phone) {
      this.setData({ loginInfoText: phone.substring(0, 3) + '****' + phone.substring(7) });
    }

    this.loadPartner();
  },

  onShow() {
    this.loadPartner();
    this.startPartnerPoll();
  },

  onHide() {
    if (this.data._partnerPollTimer) {
      clearInterval(this.data._partnerPollTimer);
      this.data._partnerPollTimer = null;
    }
  },

  onUnload() {
    if (this.data._partnerPollTimer) {
      clearInterval(this.data._partnerPollTimer);
      this.data._partnerPollTimer = null;
    }
  },

  // 轮询检测是否被对方解绑
  startPartnerPoll() {
    const app = getApp();
    const phone = app.globalData.userPhone || wx.getStorageSync('phone') || '';
    if (!phone) return;

    var self = this;
    var poll = function () {
      api.getPartner(app.globalData.openid, phone).then(function (partner) {
        if (!partner && self.data.partner) {
          // 之前有伴侣，现在没有了 → 被对方解绑
          self.data.partner = null;
          app.globalData.partner = null;
          app.globalData.partnerId = null;
          self.setData({ partner: null, isPartnerAvatarUrl: false, showUnbindAnim: true });

          // 2秒后隐藏心碎弹窗，跳转到绑定页
          setTimeout(function () {
            self.setData({ showUnbindAnim: false });
            wx.redirectTo({ url: '/pages/bind/bind' });
          }, 2000);
        }
      }).catch(function () {});
    };

    this.data._partnerPollTimer = setInterval(poll, 5000);
  },

  // 判断 avatar 是否为 URL（兼容旧数据）
  checkIsUrl(avatar) {
    if (!avatar) return false;
    if (typeof avatar !== 'string') return false;
    if (avatar.indexOf('https://') === 0) return true;
    if (avatar.indexOf('cloud://') === 0) return true;
    if (avatar.indexOf('http://') === 0 && avatar.indexOf('http://tmp') !== 0) return true;
    return false;
  },

  // 头像加载失败 → 回退到 emoji（兼容旧数据）
  onUserAvatarError() {
    this.setData({ isAvatarUrl: false, 'userInfo.avatar': '👤' });
  },

  onPartnerAvatarError() {
    this.setData({ isPartnerAvatarUrl: false, 'partner.avatar': '👤' });
  },

  loadPartner() {
    const app = getApp();
    const phone = app.globalData.userPhone || wx.getStorageSync('phone') || '';

    api.getPartner(app.globalData.openid, phone)
      .then(partner => {
        const isPartnerAvatarUrl = this.checkIsUrl(partner ? partner.avatar : '');
        this.setData({ partner, isPartnerAvatarUrl });
      })
      .catch(() => {
        this.setData({ partner: null, isPartnerAvatarUrl: false });
      });
  },

  onShowLoginInfo() {
    const app = getApp();
    const openid = app.globalData.openid || '未获取';
    const role = app.globalData.role || '未知';

    wx.showModal({
      title: '登录信息',
      content: '用户ID: ' + openid.substring(0, 12) + '...\n角色: ' + (role === 'boy' ? '厨师' : '点餐方'),
      showCancel: false,
      confirmText: '知道了'
    });
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？下次可以用手机号重新登录。',
      confirmText: '退出',
      confirmColor: '#ff4757',
      success: (res) => {
        if (res.confirm) {
          // 只清除本地状态，不删除云数据
          try {
            wx.removeStorageSync('phone');
            wx.removeStorageSync('role');
            wx.removeStorageSync('userInfo');
          } catch (err) {
            console.error('清除本地存储失败:', err);
          }
          const app = getApp();
          app.globalData.role = null;
          app.globalData.userInfo = null;
          app.globalData.openid = null;
          app.globalData.partner = null;
          app.globalData.userPhone = null;
          wx.reLaunch({ url: '/pages/index/index' });
        }
      }
    });
  },

  // 注销账号
  onDeleteAccount() {
    const phone = getApp().globalData.userPhone || wx.getStorageSync('phone') || '';

    wx.showModal({
      title: '注销账号',
      content: '注销将永久删除你的账号、菜品、订单等所有数据，且无法恢复。确定要注销吗？',
      confirmText: '确认注销',
      confirmColor: '#ff4757',
      success: (res) => {
        if (res.confirm) {
          // 二次确认
          wx.showModal({
            title: '再次确认',
            content: '此操作不可撤销，确定要注销账号吗？',
            confirmText: '确定注销',
            confirmColor: '#ff4757',
            success: async (res2) => {
              if (res2.confirm) {
                wx.showLoading({ title: '注销中...' });
                try {
                  await api.deleteAccount(phone);

                  // 清除本地存储
                  try {
                    wx.removeStorageSync('phone');
                    wx.removeStorageSync('role');
                    wx.removeStorageSync('userInfo');
                  } catch (e) {}

                  // 清除全局状态
                  const app = getApp();
                  app.globalData.role = null;
                  app.globalData.userInfo = null;
                  app.globalData.openid = null;
                  app.globalData.partner = null;
                  app.globalData.userPhone = null;

                  wx.hideLoading();
                  wx.showToast({ title: '账号已注销', icon: 'success', duration: 1500 });
                  setTimeout(() => {
                    wx.reLaunch({ url: '/pages/index/index' });
                  }, 1500);
                } catch (err) {
                  wx.hideLoading();
                  wx.showToast({ title: err.message || '注销失败', icon: 'none' });
                }
              }
            }
          });
        }
      }
    });
  },

  onUnbind() {
    const app = getApp();
    const openid = app.globalData.openid;
    const phone = app.globalData.userPhone || wx.getStorageSync('phone') || '';

    wx.showModal({
      title: '解除绑定',
      content: '确定要解除情侣绑定吗？解除后对方的记录将无法同步。',
      confirmText: '确定解除',
      confirmColor: '#ff4757',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '解除中...' });

          api.unbind(openid, phone)
            .then(() => {
              wx.hideLoading();
              app.globalData.partner = null;
              app.globalData.partnerId = null;
              this.setData({ partner: null });

              // 显示心碎动画
              this.setData({ showUnbindAnim: true });
              setTimeout(() => {
                this.setData({ showUnbindAnim: false });
                wx.redirectTo({ url: '/pages/bind/bind' });
              }, 2000);
            })
            .catch(err => {
              wx.hideLoading();
              wx.showToast({ title: '解除失败，请重试', icon: 'none', duration: 2000 });
              console.error('unbind error:', err);
            });
        }
      }
    });
  },

  onBack() {
    const app = getApp();
    const role = app.globalData.role;
    const url = role === 'boy' ? '/pages/boy-home/boy-home' : '/pages/girl-home/girl-home';
    nav.switchTo(url);
  },

  onGoBind() {
    wx.navigateTo({ url: '/pages/bind/bind?skip=1' });
  },

  // ===== 编辑个人信息 =====
  noop() {},

  showEditPanel() {
    const userInfo = this.data.userInfo;
    this.setData({
      showEditModal: true,
      editAvatar: userInfo.avatar || '👤',
      editNickname: userInfo.nickname || ''
    });
  },

  closeEditPanel() {
    this.setData({ showEditModal: false });
  },

  // ========== 修改密码（分步验证） ==========
  showChangePwdPanel() {
    this.setData({
      showChangePwdModal: true,
      pwdStep: 1,
      oldPwd: '',
      newPwd: '',
      confirmPwd: '',
      pwdFocused: false,
      keyboardHeight: 0
    });
    // 监听键盘高度变化
    var self = this;
    wx.onKeyboardHeightChange(function (res) {
      if (res.height > 0) {
        self.setData({ keyboardHeight: res.height });
      } else {
        self.setData({ keyboardHeight: 0 });
      }
    });
    // 自动聚焦
    setTimeout(() => { this.setData({ pwdFocused: true }); }, 100);
  },

  closeChangePwdPanel() {
    this.setData({
      showChangePwdModal: false,
      pwdFocused: false,
      keyboardHeight: 0
    });
    wx.offKeyboardHeightChange();
  },

  onPwdBoxTap() {
    this.setData({ pwdFocused: false });
    setTimeout(() => { this.setData({ pwdFocused: true }); }, 50);
  },
  onPwdFocus() {
    this.setData({ pwdFocused: true });
  },
  onPwdBlur() {
    this.setData({ pwdFocused: false, keyboardHeight: 0 });
  },

  onOldPwdInput(e) {
    this.setData({ oldPwd: e.detail.value });
  },
  onNewPwdInput(e) {
    this.setData({ newPwd: e.detail.value });
  },
  onConfirmPwdInput(e) {
    this.setData({ confirmPwd: e.detail.value });
  },

  // 步骤1 → 验证旧密码
  async onVerifyOldPwd() {
    const { oldPwd } = this.data;
    const phone = getApp().globalData.userPhone || wx.getStorageSync('phone') || '';

    if (!oldPwd || oldPwd.length !== 6) {
      wx.showToast({ title: '请输入6位密码', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '验证中...' });
    try {
      // 用 checkLogin 验证旧密码
      await api.checkLogin(phone, oldPwd);
      wx.hideLoading();
      // 旧密码正确 → 进入步骤2
      this.setData({ pwdStep: 2, pwdFocused: false });
      setTimeout(() => { this.setData({ pwdFocused: true }); }, 100);
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: '旧密码错误', icon: 'none' });
      // 清空旧密码，重新输入
      this.setData({ oldPwd: '', pwdFocused: false });
      setTimeout(() => { this.setData({ pwdFocused: true }); }, 100);
    }
  },

  // 步骤2 → 新密码下一步
  onNewPwdNext() {
    const { newPwd, oldPwd } = this.data;

    if (!newPwd || newPwd.length !== 6) {
      wx.showToast({ title: '请输入6位新密码', icon: 'none' });
      return;
    }
    if (newPwd === oldPwd) {
      wx.showToast({ title: '新密码不能与旧密码相同', icon: 'none' });
      return;
    }

    this.setData({ pwdStep: 3, pwdFocused: false });
    setTimeout(() => { this.setData({ pwdFocused: true }); }, 100);
  },

  // 返回步骤1
  onPwdBackToStep1() {
    this.setData({ pwdStep: 1, newPwd: '', pwdFocused: false });
    setTimeout(() => { this.setData({ pwdFocused: true }); }, 100);
  },

  // 返回步骤2
  onPwdBackToStep2() {
    this.setData({ pwdStep: 2, confirmPwd: '', pwdFocused: false });
    setTimeout(() => { this.setData({ pwdFocused: true }); }, 100);
  },

  // 步骤3 → 确认修改
  async onConfirmChangePwd() {
    const { oldPwd, newPwd, confirmPwd } = this.data;
    const phone = getApp().globalData.userPhone || wx.getStorageSync('phone') || '';

    if (!confirmPwd || confirmPwd.length !== 6) {
      wx.showToast({ title: '请输入6位密码', icon: 'none' });
      return;
    }
    if (newPwd !== confirmPwd) {
      wx.showToast({ title: '两次密码不一致', icon: 'none' });
      this.setData({ confirmPwd: '', pwdFocused: false });
      setTimeout(() => { this.setData({ pwdFocused: true }); }, 100);
      return;
    }

    wx.showLoading({ title: '修改中...' });
    try {
      await api.changePassword(phone, oldPwd, newPwd);
      wx.hideLoading();
      this.setData({ showChangePwdModal: false, pwdFocused: false });
      wx.showToast({ title: '密码修改成功', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      wx.showToast({ title: err.message || '修改失败', icon: 'none' });
    }
  },

  onSelectEditEmoji(e) {
    this.setData({ editAvatar: e.currentTarget.dataset.emoji });
  },

  onEditNickInput(e) {
    this.setData({ editNickname: e.detail.value });
  },

  onEditNickBlur(e) {
    this.setData({ editNickname: e.detail.value });
  },

  async saveProfile() {
    const nickname = this.data.editNickname.trim();
    const avatar = this.data.editAvatar;

    if (!nickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '保存中...' });

    try {
      const app = getApp();
      const phone = app.globalData.userPhone || wx.getStorageSync('phone') || '';
      const role = app.globalData.role || 'girl';

      // 调用 updateProfile 更新用户信息（只更新昵称和头像，不校验密码）
      const result = await wx.cloud.callFunction({
        name: 'login',
        data: { action: 'updateProfile', phone, nickname, avatar }
      });
      const userData = (result.result && result.result.data && result.result.data.user) ? result.result.data.user : Object.assign({}, app.globalData.userInfo, { nickname, avatar });

      // 更新全局数据和本地存储
      app.globalData.userInfo = userData;
      wx.setStorageSync('userInfo', userData);

      // 更新页面显示
      this.setData({
        userInfo: userData,
        isAvatarUrl: this.checkIsUrl(avatar),
        showEditModal: false
      });

      wx.hideLoading();
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (err) {
      wx.hideLoading();
      console.error('保存个人信息失败:', err);
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    }
  }
});
