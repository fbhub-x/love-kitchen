App({
  globalData: {
    role: null, // 'girl' | 'boy'
    userInfo: null,
    openid: null,
    userPhone: null, // 手机号作为用户唯一标识
    partner: null,
    inviteCode: null
  },

  onLaunch() {
    wx.cloud.init({
      env: 'cloud1-d4ggqiq106a8a7e74', // 需要替换为你的云环境ID
      traceUser: true
    });
  }
});