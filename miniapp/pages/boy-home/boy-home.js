const api = require('../../utils/api');
const nav = require('../../utils/nav');

const STATUS_MAP = {
  pending: '待接单',
  cooking: '制作中',
  completed: '已完成'
};

Page({
  data: {
    orders: [],
    stats: {
      pending: 0,
      cooking: 0,
      completed: 0
    },
    // 弹窗通知
    showNotif: false,
    notifIcon: '',
    notifTitle: '',
    notifDesc: '',
    _notifTimer: null,
    _orderPollTimer: null,
    _partnerPollTimer: null,
    _hadPartner: false
  },

  onLoad() {
    this.fetchOrders();
    this.startWatchingOrders();
  },

  onShow() {
    this.fetchOrders();
    this.startPartnerPoll();
  },

  onUnload() {
    if (this.data._orderPollTimer) {
      clearInterval(this.data._orderPollTimer);
      this.data._orderPollTimer = null;
    }
    if (this.data._partnerPollTimer) {
      clearInterval(this.data._partnerPollTimer);
      this.data._partnerPollTimer = null;
    }
    if (this.data._notifTimer) {
      clearTimeout(this.data._notifTimer);
    }
  },

  // 轮询检测伴侣是否解绑
  startPartnerPoll() {
    const app = getApp();
    const phone = app.globalData.userPhone || wx.getStorageSync('phone') || '';
    if (!phone) return;

    if (this.data._partnerPollTimer) {
      clearInterval(this.data._partnerPollTimer);
    }

    var self = this;
    var poll = function () {
      api.getPartner(app.globalData.openid, phone).then(function (partner) {
        if (partner) {
          self.data._hadPartner = true;
          app.globalData.partner = partner;
        } else {
          if (self.data._hadPartner) {
            self.data._hadPartner = false;
            app.globalData.partner = null;
            app.globalData.partnerId = null;
            wx.showModal({
              title: '提示',
              content: '您的伴侣已解除绑定',
              showCancel: false,
              confirmText: '我知道了',
              confirmColor: '#ff6b81',
              success: function () {
                wx.redirectTo({ url: '/pages/bind/bind' });
              }
            });
          }
        }
      }).catch(function () {});
    };

    poll();
    this.data._partnerPollTimer = setInterval(poll, 5000);
  },

  // 轮询监听新订单（检测女方下单 → 弹窗）
  // 用本地存储记录已看过的订单ID，切换角色后也能检测到新订单
  startWatchingOrders() {
    const app = getApp();
    const phone = app.globalData.userPhone || wx.getStorageSync('phone') || '';
    if (!phone) return;

    var self = this;
    var storageKey = 'boy_seen_orders_' + phone;

    // 从本地存储加载已看过的订单ID
    var seenOrders = {};
    try {
      var stored = wx.getStorageSync(storageKey);
      if (stored && Array.isArray(stored)) {
        for (var k = 0; k < stored.length; k++) {
          seenOrders[stored[k]] = true;
        }
      }
    } catch (e) {}

    var saveSeenOrders = function () {
      var arr = Object.keys(seenOrders);
      try { wx.setStorageSync(storageKey, arr); } catch (e) {}
    };

    var poll = function () {
      api.getBoyOrders(phone).then(function (orders) {
        if (!orders || orders.length === 0) return;

        var hasNewPending = false;
        for (var i = 0; i < orders.length; i++) {
          var oid = orders[i].orderId;
          if (!oid) continue;

          // 检测未看过的 pending 订单
          if (orders[i].status === 'pending' && !seenOrders[oid]) {
            hasNewPending = true;
          }

          // 记录所有订单ID为已看过
          seenOrders[oid] = true;
        }

        if (hasNewPending) {
          self.showNotifPopup('📦', '收到新订单', '快去查看，给Ta做菜吧~');
        }

        saveSeenOrders();
        self.fetchOrders();
      }).catch(function (err) {
        console.error('轮询订单失败:', err);
      });
    };

    // 立即执行一次，然后每5秒轮询
    poll();
    this.data._orderPollTimer = setInterval(poll, 5000);
  },

  // 显示弹窗通知
  showNotifPopup(icon, title, desc) {
    var self = this;
    this.setData({
      showNotif: true,
      notifIcon: icon,
      notifTitle: title,
      notifDesc: desc
    });
    if (this.data._notifTimer) clearTimeout(this.data._notifTimer);
    this.data._notifTimer = setTimeout(function () {
      self.setData({ showNotif: false });
    }, 4000);
  },

  // 关闭弹窗通知
  closeNotif() {
    this.setData({ showNotif: false });
    if (this.data._notifTimer) clearTimeout(this.data._notifTimer);
  },

  fetchOrders() {
    const app = getApp();
    const phone = app.globalData.userPhone || wx.getStorageSync('phone') || '';

    if (!phone) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    api.getBoyOrders(phone)
      .then(res => {
        var rawOrders = [];
        if (Array.isArray(res)) {
          rawOrders = res;
        } else if (res && res.data) {
          rawOrders = res.data;
        }

        var orders = [];
        for (var i = 0; i < rawOrders.length; i++) {
          orders.push(this.formatOrder(rawOrders[i]));
        }

        this.setData({ orders: orders });
        this.computeStats(orders);
      })
      .catch(err => {
        console.error('fetchOrders error:', err);
      });
  },

  formatOrder(order) {
    var status = order.status || 'pending';
    var items = order.items || [];

    if (typeof items === 'string') {
      try { items = JSON.parse(items); } catch (e) { items = []; }
    }

    var timeText = '';
    if (order.createdAt) {
      try {
        var d = order.createdAt;
        if (typeof d === 'string') {
          timeText = this.formatTime(new Date(d));
        } else if (d instanceof Date) {
          timeText = this.formatTime(d);
        } else if (typeof d === 'object' && d.$date) {
          timeText = this.formatTime(new Date(d.$date));
        } else if (typeof d === 'object' && d.iso) {
          timeText = this.formatTime(new Date(d.iso));
        } else {
          timeText = String(d);
        }
      } catch (e) {
        timeText = '';
      }
    }

    return {
      _id: order._id || '',
      orderId: order.orderId || '',
      status: status,
      statusText: STATUS_MAP[status] || '待接单',
      items: items,
      note: order.note || '',
      timeText: timeText
    };
  },

  formatTime(date) {
    var month = date.getMonth() + 1;
    var day = date.getDate();
    var hours = date.getHours();
    var minutes = date.getMinutes();
    if (month < 10) month = '0' + month;
    if (day < 10) day = '0' + day;
    if (hours < 10) hours = '0' + hours;
    if (minutes < 10) minutes = '0' + minutes;
    return month + '-' + day + ' ' + hours + ':' + minutes;
  },

  computeStats(orders) {
    var stats = { pending: 0, cooking: 0, completed: 0 };
    for (var i = 0; i < orders.length; i++) {
      if (orders[i].status === 'pending') stats.pending++;
      if (orders[i].status === 'cooking') stats.cooking++;
      if (orders[i].status === 'completed') stats.completed++;
    }
    this.setData({ stats: stats });
  },

  // 开始制作
  onStartCooking(e) {
    var orderId = e.currentTarget.dataset.id;
    var self = this;

    wx.showModal({
      title: '确认',
      content: '确定开始制作这个订单吗？',
      success: function (res) {
        if (res.confirm) {
          wx.showLoading({ title: '更新中...' });
          api.updateOrderStatus(orderId, 'cooking')
            .then(function () {
              wx.hideLoading();
              wx.showToast({ title: '已开始制作', icon: 'success' });
              self.fetchOrders();
            })
            .catch(function (err) {
              wx.hideLoading();
              console.error('更新状态失败:', err);
              wx.showToast({ title: '更新失败', icon: 'none' });
            });
        }
      }
    });
  },

  // 完成订单
  onComplete(e) {
    var orderId = e.currentTarget.dataset.id;
    var self = this;

    wx.showModal({
      title: '确认',
      content: '确定这个订单已完成吗？',
      success: function (res) {
        if (res.confirm) {
          wx.showLoading({ title: '更新中...' });
          api.updateOrderStatus(orderId, 'completed')
            .then(function () {
              wx.hideLoading();
              wx.showToast({ title: '订单已完成', icon: 'success' });
              self.fetchOrders();
            })
            .catch(function (err) {
              wx.hideLoading();
              console.error('更新状态失败:', err);
              wx.showToast({ title: '更新失败', icon: 'none' });
            });
        }
      }
    });
  },

  onGoToOrders() {
    var app = getApp();
    app.globalData.role = 'boy';
    nav.switchTo('/pages/orders/orders');
  },

  onGoToDishes() {
    nav.switchTo('/pages/boy-dishes/boy-dishes');
  },

  onGoToSettings() {
    nav.switchTo('/pages/settings/settings');
  },

  onSwitchRole() {
    wx.showModal({
      title: '切换角色',
      content: '确定要切换到点餐方吗？',
      confirmText: '确定',
      cancelText: '取消',
      success: function (res) {
        if (res.confirm) {
          var app = getApp();
          app.globalData.role = 'girl';
          wx.redirectTo({ url: '/pages/girl-home/girl-home' });
        }
      }
    });
  }
});
