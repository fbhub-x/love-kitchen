const api = require('../../utils/api');
const nav = require('../../utils/nav');

Page({
  data: {
    cart: [],
    note: '',
    quickNotes: [
      { text: '少放盐', emoji: '🧂', selected: false },
      { text: '不要太辣', emoji: '🌶️', selected: false },
      { text: '多加点糖', emoji: '🍬', selected: false },
      { text: '清淡一点', emoji: '🥬', selected: false },
      { text: '趁热吃', emoji: '🔥', selected: false },
      { text: '少放油', emoji: '💧', selected: false }
    ]
  },

  onLoad() {
    this.loadCart();
  },

  onShow() {
    this.loadCart();
  },

  loadCart() {
    const app = getApp();
    const phone = app.globalData.userPhone || wx.getStorageSync('phone') || '';
    const cart = wx.getStorageSync('cart_' + phone) || [];
    this.setData({ cart });
  },

  saveCart() {
    const app = getApp();
    const phone = app.globalData.userPhone || wx.getStorageSync('phone') || '';
    wx.setStorageSync('cart_' + phone, this.data.cart);
  },

  increaseQty(e) {
    const id = e.currentTarget.dataset.id;
    const cart = this.data.cart.map(item => {
      if (item._id === id) {
        return { ...item, count: (item.count || 1) + 1 };
      }
      return item;
    });
    this.setData({ cart });
    this.saveCart();
  },

  decreaseQty(e) {
    const id = e.currentTarget.dataset.id;
    const cart = this.data.cart;
    const item = cart.find(i => i._id === id);
    if (!item) return;

    // 如果数量为1，点击-号直接删除
    if ((item.count || 1) <= 1) {
      wx.showModal({
        title: '确认',
        content: '确定要删除「' + item.name + '」吗？',
        confirmColor: '#ff4757',
        success: (res) => {
          if (res.confirm) {
            const newCart = cart.filter(i => i._id !== id);
            this.setData({ cart: newCart });
            this.saveCart();
            wx.showToast({ title: '已删除', icon: 'success', duration: 1000 });
          }
        }
      });
    } else {
      const newCart = cart.map(i => {
        if (i._id === id) {
          return { ...i, count: (i.count || 1) - 1 };
        }
        return i;
      });
      this.setData({ cart: newCart });
      this.saveCart();
    }
  },

  deleteItem(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除该菜品吗？',
      confirmColor: '#ff4757',
      success: (res) => {
        if (res.confirm) {
          const cart = this.data.cart.filter(item => item._id !== id);
          this.setData({ cart });
          this.saveCart();
          wx.showToast({ title: '已删除', icon: 'success', duration: 1500 });
        }
      }
    });
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value });
  },

  onQuickNote(e) {
    const index = e.currentTarget.dataset.index;
    const quickNotes = this.data.quickNotes.slice();
    const item = quickNotes[index];
    const text = item.text;
    const currentNote = this.data.note;

    if (!item.selected) {
      // 选中：追加
      const newNote = currentNote ? currentNote + '、' + text : text;
      quickNotes[index].selected = true;
      this.setData({ note: newNote, quickNotes });
    } else {
      // 取消选中：移除
      quickNotes[index].selected = false;
      var parts = currentNote.split('、').filter(function (s) { return s !== text; });
      this.setData({ note: parts.join('、'), quickNotes });
    }
  },

  submitOrder() {
    const { cart, note } = this.data;
    if (cart.length === 0) {
      wx.showToast({ title: '购物车为空', icon: 'none', duration: 2000 });
      return;
    }

    const app = getApp();
    const phone = app.globalData.userPhone || wx.getStorageSync('phone') || '';

    if (!phone) {
      wx.showToast({ title: '请先登录', icon: 'none', duration: 2000 });
      return;
    }

    wx.showLoading({ title: '提交中...' });

    api.createOrder(phone, cart, note)
      .then(() => {
        wx.hideLoading();
        const app2 = getApp();
        const phone2 = app2.globalData.userPhone || wx.getStorageSync('phone') || '';
        wx.setStorageSync('cart_' + phone2, []);
        this.setData({ cart: [], note: '' });
        wx.showToast({ title: '下单成功 💕', icon: 'success', duration: 2000 });
        setTimeout(() => {
          // 确保角色为女方，跳转到订单页
          app2.globalData.role = 'girl';
          wx.reLaunch({ url: '/pages/orders/orders' });
        }, 2000);
      })
      .catch(err => {
        wx.hideLoading();
        console.error('createOrder error:', err);

        // 根据错误类型显示不同的提示
        let msg = '下单失败，请重试';
        if (err && err.message) {
          if (err.message.indexOf('还没有绑定伴侣') !== -1) {
            msg = '请先绑定伴侣再下单';
          } else if (err.message.indexOf('permission') !== -1 || err.message.indexOf('权限') !== -1) {
            msg = '数据库权限不足，请检查集合权限';
          }
        } else if (err && err.errCode) {
          msg = '下单失败: ' + err.errCode;
        }

        wx.showToast({ title: msg, icon: 'none', duration: 3000 });
      });
  },

  onBack() {
    nav.switchTo('/pages/girl-home/girl-home');
  }
});
