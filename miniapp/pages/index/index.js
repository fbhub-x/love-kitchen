const api = require('../../utils/api');

Page({
  data: {
    selectedRole: '',
    loginStep: 1,
    defaultAvatar: '👩‍🦰',
    avatarUrl: '',
    nickname: '',
    phone: '',
    password: '',
    pinFocused: false,
    emojiList: [
      '👩‍🦰', '👨‍🍳', '🐱', '🐰', '🐻', '🦊',
      '🐼', '🐨', '🦁', '🐯', '🐸', '🐵',
      '🦄', '🐝', '🦋', '🌸', '☀️', '🌙'
    ]
  },

  onLoad() {
    this.checkLogin();
  },

  // 检查是否已登录（通过本地存储的手机号）
  async checkLogin() {
    var app = getApp();

    if (app.globalData.userInfo && app.globalData.role && app.globalData.userInfo.phone) {
      var url = app.globalData.role === 'girl' ? '/pages/girl-home/girl-home' : '/pages/boy-home/boy-home';
      wx.redirectTo({ url: url });
      return;
    }

    var storedPhone = wx.getStorageSync('phone');
    var storedRole = wx.getStorageSync('role');
    var storedUserInfo = wx.getStorageSync('userInfo');

    if (storedPhone && storedUserInfo && storedRole) {
      try {
        var data = await api.getUserByPhone(storedPhone);
        if (data && data.user) {
          app.globalData.openid = data.user._openid || '';
          app.globalData.role = data.user.role || storedRole;
          app.globalData.userInfo = data.user;

          var url2 = (data.user.role || storedRole) === 'girl' ? '/pages/girl-home/girl-home' : '/pages/boy-home/boy-home';
          wx.redirectTo({ url: url2 });
          return;
        }
      } catch (e) {
        console.error('验证用户失败:', e);
      }
    }

    this.silentLogin();
  },

  async silentLogin() {
    try {
      const loginData = await api.login();
      const app = getApp();
      app.globalData.openid = loginData.openid;
    } catch (e) {
      console.error('静默登录失败:', e);
    }
  },

  selectRole(e) {
    var role = e.currentTarget.dataset.role;
    this.setData({
      selectedRole: role,
      loginStep: 1,
      defaultAvatar: role === 'girl' ? '👩‍🦰' : '👨‍🍳'
    });
  },

  backToRole() {
    this.setData({
      selectedRole: '',
      loginStep: 1,
      avatarUrl: '',
      nickname: '',
      phone: '',
      password: ''
    });
  },

  backToStep1() {
    this.setData({ loginStep: 1 });
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  onPinBoxTap() {
    this.setData({ pinFocused: false });
    setTimeout(() => {
      this.setData({ pinFocused: true });
    }, 50);
  },

  onPinFocus() {
    this.setData({ pinFocused: true });
  },

  onPinBlur() {
    this.setData({ pinFocused: false });
  },

  onSelectEmoji(e) {
    this.setData({ avatarUrl: e.currentTarget.dataset.emoji });
  },

  onNickInput(e) {
    this.setData({ nickname: e.detail.value });
  },

  onNickBlur(e) {
    this.setData({ nickname: e.detail.value });
  },

  // 步骤1：验证手机号+密码
  async onStep1Next() {
    var phone = this.data.phone;
    var password = this.data.password;

    if (!phone || phone.length !== 11) {
      wx.showToast({ title: '请输入11位手机号', icon: 'none' });
      return;
    }
    if (!password || password.length !== 6) {
      wx.showToast({ title: '请输入6位数字密码', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '验证中...' });

    try {
      var app = getApp();
      if (!app.globalData.openid) {
        var loginData = await api.login();
        app.globalData.openid = loginData.openid;
      }

      // 调用 checkLogin 判断新/老用户
      var result = await api.checkLogin(phone, password);
      wx.hideLoading();

      if (result.isNew) {
        // 新用户 → 进入步骤2
        this.setData({ loginStep: 2 });
      } else {
        // 老用户 → 直接登录
        var userData = result.user || {};
        app.globalData.role = userData.role || this.data.selectedRole;
        app.globalData.userInfo = userData;
        app.globalData.userPhone = phone;

        wx.setStorageSync('phone', phone);
        wx.setStorageSync('role', app.globalData.role);
        wx.setStorageSync('userInfo', userData);

        wx.showToast({ title: '登录成功', icon: 'success', duration: 1500 });
        setTimeout(function () {
          var url = app.globalData.role === 'girl' ? '/pages/girl-home/girl-home' : '/pages/boy-home/boy-home';
          wx.redirectTo({ url: url });
        }, 1500);
      }
    } catch (err) {
      wx.hideLoading();
      console.error('登录失败:', err);
      wx.showToast({ title: err.message || '登录失败', icon: 'none', duration: 2000 });
    }
  },

  // 步骤2：新用户注册
  async onStep2Confirm() {
    var nickname = this.data.nickname.trim();
    var phone = this.data.phone;
    var password = this.data.password;
    var role = this.data.selectedRole;
    var avatar = this.data.avatarUrl || this.data.defaultAvatar;

    if (!nickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '注册中...' });

    try {
      var app = getApp();
      if (!app.globalData.openid) {
        var loginData = await api.login();
        app.globalData.openid = loginData.openid;
      }

      var result = await api.register(phone, role, nickname, avatar, password);
      var userData = (result && result.user) ? result.user : { nickname: nickname, avatar: avatar, phone: phone, role: role };

      app.globalData.role = role;
      app.globalData.userInfo = userData;
      app.globalData.userPhone = phone;

      wx.setStorageSync('phone', phone);
      wx.setStorageSync('role', role);
      wx.setStorageSync('userInfo', userData);

      wx.hideLoading();
      wx.showToast({ title: '注册成功', icon: 'success', duration: 1500 });
      setTimeout(function () {
        wx.redirectTo({ url: '/pages/bind/bind?skip=1' });
      }, 1500);
    } catch (err) {
      wx.hideLoading();
      console.error('注册失败:', err);
      wx.showToast({ title: err.message || '注册失败', icon: 'none', duration: 2000 });
    }
  }
});
