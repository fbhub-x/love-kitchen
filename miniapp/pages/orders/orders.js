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
      total: 0,
      pending: 0,
      cooking: 0,
      completed: 0
    },
    role: ''
  },

  onLoad() {
    const app = getApp();
    const role = app.globalData.role || 'girl';
    this.setData({ role });
    this.fetchOrders();
  },

  onShow() {
    this.fetchOrders();
  },

  fetchOrders() {
    const app = getApp();
    const role = app.globalData.role || this.data.role;
    const phone = app.globalData.userPhone || wx.getStorageSync('phone') || '';

    if (!phone) {
      wx.showToast({ title: '请先登录', icon: 'none', duration: 2000 });
      return;
    }

    wx.showLoading({ title: '加载中...' });

    const apiCall = role === 'boy' ? api.getBoyOrders : api.getGirlOrders;

    apiCall(phone)
      .then(res => {
        wx.hideLoading();
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
        wx.hideLoading();
        wx.showToast({ title: '加载失败', icon: 'none', duration: 2000 });
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
    var stats = { total: orders.length, pending: 0, cooking: 0, completed: 0 };
    for (var i = 0; i < orders.length; i++) {
      if (orders[i].status === 'pending') stats.pending++;
      if (orders[i].status === 'cooking') stats.cooking++;
      if (orders[i].status === 'completed') stats.completed++;
    }
    this.setData({ stats: stats });
  },

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
              wx.showToast({ title: '更新失败', icon: 'none' });
            });
        }
      }
    });
  },

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
              wx.showToast({ title: '更新失败', icon: 'none' });
            });
        }
      }
    });
  },

  onGoHome() {
    var role = this.data.role;
    var url = role === 'boy' ? '/pages/boy-home/boy-home' : '/pages/girl-home/girl-home';
    nav.switchTo(url);
  },

  onGoToDishes() {
    nav.switchTo('/pages/boy-dishes/boy-dishes');
  },

  onBack() {
    var role = this.data.role;
    var url = role === 'boy' ? '/pages/boy-home/boy-home' : '/pages/girl-home/girl-home';
    nav.switchTo(url);
  }
});
