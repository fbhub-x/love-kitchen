const api = require('../../utils/api');

Page({
  data: {
    step: 1,
    role: '',
    nickname: '',
    avatar: '👩‍🦰',
    phone: '',
    inviteCode: '',
    inviteExpireText: '',
    showJoinInput: false,
    joinCode: '',
    partnerName: '',
    partnerAvatar: '',
    partnerAvatarIsUrl: false,
    myAvatar: '👩‍🦰',
    myAvatarIsUrl: false,
    showUnbindAnim: false,
    _partnerPollTimer: null
  },

  onLoad(options) {
    // 如果带 skip=1 参数，说明已在 index 页注册过，直接跳到步骤2
    if (options.skip === '1') {
      var app = getApp();
      var userInfo = app.globalData.userInfo || {};
      this.setData({
        step: 2,
        role: app.globalData.role || 'girl',
        nickname: userInfo.nickname || '',
        avatar: userInfo.avatar || '',
        myAvatar: userInfo.avatar || '👩‍🦰',
        phone: userInfo.phone || ''
      });
    }
  },

  onUnload() {
    if (this.data._partnerPollTimer) {
      clearInterval(this.data._partnerPollTimer);
      this.data._partnerPollTimer = null;
    }
  },

  // 判断 avatar 是否为 URL（只接受跨设备可用的 URL）
  checkIsUrl(avatar) {
    if (!avatar) return false;
    if (typeof avatar !== 'string') return false;
    if (avatar.indexOf('https://') === 0) return true;
    if (avatar.indexOf('cloud://') === 0) return true;
    if (avatar.indexOf('http://') === 0 && avatar.indexOf('http://tmp') !== 0) return true;
    return false;
  },

  // 头像加载失败 → 回退到 emoji
  onMyAvatarError() {
    this.setData({ myAvatarIsUrl: false, myAvatar: '👩‍🦰' });
  },

  onPartnerAvatarError() {
    this.setData({ partnerAvatarIsUrl: false, partnerAvatar: '👤' });
  },

  // 轮询检测是否被绑定（邀请码生成方等待对方加入）
  startPartnerPoll() {
    var self = this;
    var app = getApp();
    var phone = app.globalData.userPhone || wx.getStorageSync('phone') || '';
    if (!phone) return;

    var poll = function () {
      api.getPartner(app.globalData.openid, phone).then(function (partner) {
        if (partner) {
          // 已被绑定！停止轮询，显示成功页
          if (self.data._partnerPollTimer) {
            clearInterval(self.data._partnerPollTimer);
            self.data._partnerPollTimer = null;
          }
          app.globalData.partner = partner;
          var myAvatarVal = self.data.avatar || self.data.myAvatar;
          self.setData({
            step: 3,
            partnerName: partner.nickname || '伴侣',
            partnerAvatar: partner.avatar || '👤',
            partnerAvatarIsUrl: self.checkIsUrl(partner.avatar),
            myAvatar: myAvatarVal,
            myAvatarIsUrl: self.checkIsUrl(myAvatarVal)
          });
        }
      }).catch(function () {});
    };

    // 每3秒检测一次
    poll();
    this.data._partnerPollTimer = setInterval(poll, 3000);
  },

  copyInviteCode() {
    if (!this.data.inviteCode) return;
    wx.setClipboardData({
      data: this.data.inviteCode,
      success: function () {
        wx.showToast({ title: '已复制', icon: 'success', duration: 1500 });
      }
    });
  },

  async createInvite() {
    wx.showLoading({ title: '生成中...' });
    try {
      var app = getApp();
      var phone = app.globalData.userPhone || wx.getStorageSync('phone') || '';
      const data = await api.createInvite(app.globalData.openid, phone);
      const expireText = this.formatExpire(data.expiresIn || data.expireAt);
      this.setData({
        inviteCode: data.inviteCode,
        inviteExpireText: expireText
      });
      wx.hideLoading();
      wx.showToast({ title: '邀请码已生成', icon: 'success' });
      // 启动轮询，检测对方是否已加入
      this.startPartnerPoll();
    } catch (err) {
      wx.hideLoading();
      console.error('生成邀请码失败:', err);
      wx.showToast({ title: err.message || '生成失败', icon: 'none' });
    }
  },

  formatExpire(expiresIn) {
    if (!expiresIn) return '24小时';
    if (typeof expiresIn === 'number') {
      var hours = Math.floor(expiresIn / (60 * 60 * 1000));
      var minutes = Math.floor((expiresIn % (60 * 60 * 1000)) / (60 * 1000));
      if (hours > 0) return hours + '小时' + (minutes > 0 ? minutes + '分钟' : '');
      return minutes + '分钟';
    }
    return '24小时';
  },

  showJoin() {
    this.setData({ showJoinInput: !this.data.showJoinInput });
  },

  onJoinInput(e) {
    this.setData({ joinCode: e.detail.value.toUpperCase() });
  },

  async joinPartner() {
    if (!this.data.joinCode || this.data.joinCode.length !== 6) {
      wx.showToast({ title: '请输入6位邀请码', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '绑定中...' });
    try {
      var app = getApp();
      var phone = app.globalData.userPhone || wx.getStorageSync('phone') || '';
      await api.joinInvite(app.globalData.openid, this.data.joinCode, phone);
      var partner = await api.getPartner(app.globalData.openid, phone);
      app.globalData.partner = partner;

      wx.hideLoading();
      var myAvatarVal = this.data.avatar || this.data.myAvatar;
      this.setData({
        step: 3,
        partnerName: partner ? (partner.nickname || '伴侣') : '伴侣',
        partnerAvatar: partner ? (partner.avatar || '👤') : '👤',
        partnerAvatarIsUrl: partner ? this.checkIsUrl(partner.avatar) : false,
        myAvatar: myAvatarVal,
        myAvatarIsUrl: this.checkIsUrl(myAvatarVal)
      });
    } catch (err) {
      wx.hideLoading();
      console.error('加入失败:', err);
      wx.showToast({ title: err.message || '加入失败', icon: 'none', duration: 3000 });
    }
  },

  goHome() {
    var app = getApp();
    var url = app.globalData.role === 'girl'
      ? '/pages/girl-home/girl-home'
      : '/pages/boy-home/boy-home';
    wx.redirectTo({ url: url });
  }
});
