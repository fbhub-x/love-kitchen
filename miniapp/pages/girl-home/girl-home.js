// girl-home page
const api = require('../../utils/api');
const nav = require('../../utils/nav');

// 分类定义（不含"全部"）
const CATEGORIES = [
  { key: 'home', icon: '🍳', label: '家常菜' },
  { key: 'soup', icon: '🥣', label: '汤羹' },
  { key: 'dessert', icon: '🍰', label: '甜点' },
  { key: 'noodle', icon: '🍜', label: '面食' }
];

// 分类 key -> label 映射
const CATEGORY_LABEL_MAP = {};
CATEGORIES.forEach(function (item) {
  CATEGORY_LABEL_MAP[item.key] = item.label;
});

Page({
  data: {
    // 菜品原始数据
    dishes: [],

    // 分类列表（不含"全部"）
    categories: CATEGORIES,

    // 过滤模式：'all' 显示全部分类 | 'home'/'soup'/'dessert'/'noodle' 只显示该分类
    filterMode: 'all',

    // 侧边栏高亮的分类（由滚动或点击控制，仅用于显示，不影响过滤）
    activeCategory: '',

    // 搜索
    searchTerm: '',
    showSearchClear: false,

    // 购物车
    cart: [],
    cartTotalCount: 0,
    dishCounts: {}, // 每个菜品在购物车中的总数量 { dishId: count }

    // 通知
    hasNotifications: false,

    // 过滤并分组后的数据
    filteredCategoryGroups: [],

    // scroll-view 的动态高度（像素），初始给一个合理值防止渲染时为0
    scrollHeight: 500,

    // 通知监听器引用
    _notificationWatcher: null,

    // 飞入购物车动画
    flyBallShow: false,
    flyBallEmoji: '',
    flyBallX: 0,
    flyBallY: 0,
    flyBallPhase: 0,
    flyAnim: false,
    cartBounce: false,

    // 弹窗通知
    showNotif: false,
    notifIcon: '',
    notifTitle: '',
    notifDesc: '',
    _notifTimer: null,
    _orderPollTimer: null,
    _partnerPollTimer: null,
    _hadPartner: false,
    _dishNotifPollTimer: null,
    scrollIntoView: '',

    // 规格选择面板
    specPanelShow: false,
    specPanelDish: {},
    specSelected: {}, // { specName: selectedOption }
    specCount: 1,

    // 购物车面板
    cartPanelShow: false
  },

  // ========== 生命周期 ==========

  onLoad: function () {
    this.loadDishes();
    this.loadCartFromStorage();
    this.startWatchingOrders();
  },

  onShow: function () {
    this.loadCartFromStorage();
    this.checkNotifications();
    this.startPartnerPoll();
    this.startDishNotifPoll();
  },

  onReady: function () {
    var self = this;
    // 延迟确保 flex 布局计算完成后再测量
    setTimeout(function () {
      var sysInfo = wx.getSystemInfoSync();
      var windowHeight = sysInfo.windowHeight;
      var query = wx.createSelectorQuery();
      query.select('.app-header').boundingClientRect();
      query.select('.welcome-banner').boundingClientRect();
      query.select('.search-bar').boundingClientRect();
      query.select('.gh-cart-bar').boundingClientRect();
      query.exec(function (res) {
        if (!res) return;
        var used = 0;
        for (var i = 0; i < res.length; i++) {
          if (res[i] && res[i].height) used += res[i].height;
        }
        var h = windowHeight - used;
        if (h > 200) {
          self.setData({ scrollHeight: Math.floor(h) });
        }
      });
    }, 300);
  },

  onUnload: function () {
    // 清除轮询定时器
    if (this.data._orderPollTimer) {
      clearInterval(this.data._orderPollTimer);
      this.data._orderPollTimer = null;
    }
    if (this.data._partnerPollTimer) {
      clearInterval(this.data._partnerPollTimer);
      this.data._partnerPollTimer = null;
    }
    if (this.data._dishNotifPollTimer) {
      clearInterval(this.data._dishNotifPollTimer);
      this.data._dishNotifPollTimer = null;
    }
    // 清除通知定时器
    if (this.data._notifTimer) {
      clearTimeout(this.data._notifTimer);
    }
  },

  // ========== 菜品通知轮询 ==========

  startDishNotifPoll: function () {
    var self = this;
    // 延迟 3 秒后开始轮询，避免页面加载时误弹
    setTimeout(function () {
      self.checkDishNotif();
    }, 3000);
    // 每 15 秒检查一次
    this.data._dishNotifPollTimer = setInterval(function () {
      self.checkDishNotif();
    }, 15000);
  },

  checkDishNotif: async function () {
    var self = this;
    var app = getApp();
    var phone = app.globalData.userPhone || wx.getStorageSync('phone') || '';
    if (!phone) return;

    try {
      // 用云函数查未读通知（避免前端权限问题）
      var res = await wx.cloud.callFunction({
        name: 'notification',
        data: { action: 'getDishNotifs', phone: phone }
      });

      var notifs = (res.result && res.result.notifs) ? res.result.notifs : [];

      if (notifs.length > 0) {
        var notif = notifs[0];
        var dishName = notif.content || '菜品';
        var isAdd = notif.type === 'dish_added';
        var icon = isAdd ? '🍽️' : '🗑️';
        var title = isAdd ? '伴侣新增菜品' : '伴侣删除菜品';

        // 弹窗提示
        self.showNotifPopup(icon, title, dishName);

        // 用云函数删除所有已处理的通知（彻底避免重复弹窗）
        var ids = notifs.map(function (n) { return n._id; });
        await wx.cloud.callFunction({
          name: 'notification',
          data: { action: 'deleteNotifs', ids: ids }
        });

        // 静默刷新菜品（不弹 loading）
        self.loadDishesSilent();
      }
    } catch (e) {
      console.error('检查菜品通知失败:', e);
    }
  },

  // 静默加载菜品（不显示 loading）
  loadDishesSilent: async function () {
    try {
      var app = getApp();
      var myPhone = app.globalData.userPhone || wx.getStorageSync('phone') || '';
      var phones = [myPhone];
      try {
        var partner = await api.getPartner(app.globalData.openid, myPhone);
        if (partner && partner.phone) {
          phones.push(partner.phone);
        }
      } catch (e) {}

      var res = await wx.cloud.callFunction({
        name: 'dish',
        data: { action: 'list', phones: phones }
      });
      var dishes = (res.result && res.result.dishes) ? res.result.dishes : [];
      this.setData({ dishes: dishes });
      this.applyFilters();
    } catch (err) {
      console.error('静默加载菜品失败:', err);
    }
  },

  // 显示弹窗通知
  showNotifPopup: function (icon, title, desc) {
    var self = this;
    this.setData({
      showNotif: true,
      notifIcon: icon,
      notifTitle: title,
      notifDesc: desc
    });
    // 3秒后自动消失
    if (this.data._notifTimer) clearTimeout(this.data._notifTimer);
    this.data._notifTimer = setTimeout(function () {
      self.setData({ showNotif: false });
    }, 4000);
  },

  // 关闭弹窗通知
  closeNotif: function () {
    this.setData({ showNotif: false });
    if (this.data._notifTimer) clearTimeout(this.data._notifTimer);
  },

  // ========== 数据加载 ==========

  /**
   * 从云函数加载菜品列表
   */
  loadDishes: async function () {
    wx.showLoading({ title: '加载中...', mask: true });
    try {
      var app = getApp();
      var myPhone = app.globalData.userPhone || wx.getStorageSync('phone') || '';

      // 获取伴侣手机号
      var phones = [myPhone];
      try {
        var partner = await api.getPartner(app.globalData.openid, myPhone);
        if (partner && partner.phone) {
          phones.push(partner.phone);
        }
      } catch (e) {}

      var res = await wx.cloud.callFunction({
        name: 'dish',
        data: { action: 'list', phones: phones }
      });
      var dishes = (res.result && res.result.dishes) ? res.result.dishes : (res.result && res.result.data ? res.result.data : []);
      this.setData({ dishes: dishes });
      this.applyFilters();
    } catch (err) {
      console.error('加载菜品失败:', err);
      wx.showToast({ title: '加载失败，请下拉刷新', icon: 'none' });
      this.setData({ dishes: [], filteredCategoryGroups: [] });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 从本地存储加载购物车
   */
  loadCartFromStorage: function () {
    try {
      var app = getApp();
      var phone = app.globalData.userPhone || wx.getStorageSync('phone') || '';
      var cart = wx.getStorageSync('cart_' + phone);
      if (cart && Array.isArray(cart)) {
        // 迁移旧数据：补充 cartKey、dishId 字段
        cart = cart.map(function (item) {
          if (!item.dishId) {
            item.dishId = item._id;
          }
          if (!item.cartKey) {
            item.cartKey = item.dishId + '|' + (item.specsKey || 'default');
          }
          return item;
        });
        this.setData({ cart: cart });
        this.updateCartCount();
      }
    } catch (err) {
      console.error('读取购物车缓存失败:', err);
    }
  },

  // ========== 分类切换 ==========

  /**
   * 点击左侧分类 → 滚动到对应分类位置（不再过滤锁定）
   */
  filterCategory: function (e) {
    var key = e.currentTarget.dataset.key;
    var self = this;

    // 设置锁，防止滚动动画期间 _updateActiveByScroll 错误更新高亮
    self._clickScrolling = true;

    this.setData({
      scrollIntoView: 'cat-' + key,
      activeCategory: key
    });

    // 500ms 后解除锁并清空 scrollIntoView
    setTimeout(function () {
      self._clickScrolling = false;
      self.setData({ scrollIntoView: '' });
    }, 500);
  },

  // ========== 搜索 ==========

  /**
   * 搜索输入
   */
  onSearchInput: function (e) {
    var value = e.detail.value;
    this.setData({
      searchTerm: value,
      showSearchClear: value.length > 0
    });
    this.applyFilters();
  },

  /**
   * 清除搜索
   */
  onClearSearch: function () {
    this.setData({
      searchTerm: '',
      showSearchClear: false
    });
    this.applyFilters();
  },

  // ========== 过滤与分组 ==========

  /**
   * 根据 filterMode 和 searchTerm 过滤菜品并分组
   */
  applyFilters: function () {
    var dishes = this.data.dishes;
    var filterMode = this.data.filterMode;
    var searchTerm = this.data.searchTerm.trim().toLowerCase();

    var filtered = dishes;

    // 分类过滤（仅在非 all 模式下过滤）
    if (filterMode !== 'all') {
      filtered = filtered.filter(function (d) {
        return d.category === filterMode;
      });
    }

    // 搜索过滤
    if (searchTerm) {
      filtered = filtered.filter(function (d) {
        return d.name.toLowerCase().indexOf(searchTerm) !== -1;
      });
    }

    // 按分类分组
    var groups = [];
    var seen = {};

    filtered.forEach(function (dish) {
      var cat = dish.category || 'home';
      if (!seen[cat]) {
        seen[cat] = true;
        groups.push({
          category: cat,
          label: CATEGORY_LABEL_MAP[cat] || cat,
          dishes: []
        });
      }
      var group = groups.find(function (g) { return g.category === cat; });
      if (group) {
        group.dishes.push(dish);
      }
    });

    this.setData({ filteredCategoryGroups: groups });
  },

  // ========== 购物车 ==========

  // 空操作（用于 catchtouchmove 阻止穿透滚动）
  noop: function () {},

  /**
   * 添加菜品到购物车（无规格，直接添加，带飞入动画）
   */
  addToCart: function (e) {
    var dish = e.currentTarget.dataset.dish;
    if (!dish || !dish._id) return;
    this._addDishToCart(dish, '', '', e, 1);
  },

  /**
   * 内部方法：将菜品加入购物车
   * @param {Object} dish 菜品对象
   * @param {String} specsKey 规格key（如 "小份_微辣"），无规格时为空字符串
   * @param {String} specsText 规格显示文本（如 "小份/微辣"），无规格时为空字符串
   * @param {Object} e 事件对象（用于飞入动画），可为 null
   * @param {Number} addCount 添加数量，默认1
   */
  _addDishToCart: function (dish, specsKey, specsText, e, addCount) {
    addCount = addCount || 1;
    var cart = this.data.cart.slice();
    var cartKey = dish._id + '|' + (specsKey || 'default');
    var existing = cart.find(function (item) { return item.cartKey === cartKey; });

    if (existing) {
      existing.count = (existing.count || 1) + addCount;
    } else {
      cart.push({
        _id: dish._id,
        cartKey: cartKey,
        dishId: dish._id,
        name: dish.name,
        emoji: dish.emoji,
        desc: dish.desc,
        time: dish.time,
        category: dish.category,
        price: dish.price || '',
        specs: specsText,
        specsKey: specsKey,
        count: addCount
      });
    }

    this.setData({ cart: cart });
    this.updateCartCount();
    this.saveCartToStorage();

    // 飞入购物车动画（需要事件坐标）
    if (e) {
      this.playFlyAnimation(dish.emoji, e);
    } else {
      // 没有事件坐标时，仅做购物车弹跳动画
      var self0 = this;
      self0.setData({ cartBounce: true });
      setTimeout(function () {
        self0.setData({ cartBounce: false });
      }, 400);
    }

    // 按钮波纹动画
    this.setData({ flyAnim: true });
    var self = this;
    setTimeout(function () {
      self.setData({ flyAnim: false });
    }, 400);
  },

  // 飞入购物车动画
  playFlyAnimation: function (emoji, e) {
    var startX, startY;

    // 从事件中获取点击坐标
    if (e.touches && e.touches.length > 0) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
      startX = e.changedTouches[0].clientX;
      startY = e.changedTouches[0].clientY;
    } else if (e.detail && e.detail.x !== undefined) {
      startX = e.detail.x;
      startY = e.detail.y;
    } else {
      wx.showToast({ title: '已加入购物车', icon: 'success', duration: 800 });
      return;
    }

    var sysInfo = wx.getSystemInfoSync();
    // 飞向左下角购物车图标位置
    var endX = 36;
    var endY = sysInfo.windowHeight - 28;

    // 初始位置（点击点）
    this.setData({
      flyBallShow: true,
      flyBallEmoji: emoji,
      flyBallX: startX,
      flyBallY: startY,
      flyBallPhase: 0
    });

    var self = this;
    // 下一帧触发飞行动画
    setTimeout(function () {
      self.setData({
        flyBallX: endX,
        flyBallY: endY,
        flyBallPhase: 1
      });
    }, 30);

    // 飞行结束后：购物车弹跳 + 隐藏球
    setTimeout(function () {
      self.setData({
        flyBallShow: false,
        cartBounce: true
      });
      // 弹跳动画结束后复位
      setTimeout(function () {
        self.setData({ cartBounce: false });
      }, 400);
    }, 600);
  },

  // 计算购物车总数量 + 每个菜品的数量
  updateCartCount: function () {
    var total = 0;
    var counts = {};
    for (var i = 0; i < this.data.cart.length; i++) {
      var item = this.data.cart[i];
      var c = item.count || 1;
      total += c;
      var did = item.dishId || item._id;
      counts[did] = (counts[did] || 0) + c;
    }
    this.setData({ cartTotalCount: total, dishCounts: counts });
  },

  /**
   * 保存购物车到本地存储
   */
  saveCartToStorage: function () {
    try {
      var app = getApp();
      var phone = app.globalData.userPhone || wx.getStorageSync('phone') || '';
      wx.setStorageSync('cart_' + phone, this.data.cart);
    } catch (err) {
      console.error('保存购物车缓存失败:', err);
    }
  },

  // ========== 菜品卡片加减 ==========

  /**
   * 菜品卡片上的「+」按钮：
   * - 无规格：直接加1
   * - 有规格：打开规格选择面板
   */
  incDishCount: function (e) {
    var dish = e.currentTarget.dataset.dish;
    if (!dish || !dish._id) return;

    if (dish.specs && dish.specs.length) {
      this.openSpecPanel(e);
    } else {
      this._addDishToCart(dish, '', '', e, 1);
    }
  },

  /**
   * 菜品卡片上的「-」按钮：
   * 减少该菜品在购物车中最后添加的一项的数量
   */
  decDishCount: function (e) {
    var dish = e.currentTarget.dataset.dish;
    if (!dish || !dish._id) return;

    var cart = this.data.cart.slice();
    var lastIdx = -1;
    for (var i = cart.length - 1; i >= 0; i--) {
      if (cart[i].dishId === dish._id) {
        lastIdx = i;
        break;
      }
    }

    if (lastIdx >= 0) {
      cart[lastIdx].count = (cart[lastIdx].count || 1) - 1;
      if (cart[lastIdx].count <= 0) {
        cart.splice(lastIdx, 1);
      }
      this.setData({ cart: cart });
      this.updateCartCount();
      this.saveCartToStorage();
    }
  },

  // ========== 规格选择面板 ==========

  /**
   * 打开规格选择面板
   */
  openSpecPanel: function (e) {
    var dish = e.currentTarget.dataset.dish;
    if (!dish || !dish._id) return;

    // 默认选中每组第一个选项
    var selected = {};
    if (dish.specs && dish.specs.length) {
      for (var i = 0; i < dish.specs.length; i++) {
        var spec = dish.specs[i];
        if (spec.options && spec.options.length) {
          selected[spec.name] = spec.options[0];
        }
      }
    }

    // 关闭购物车面板（如果开着）
    this.setData({
      specPanelShow: true,
      specPanelDish: dish,
      specSelected: selected,
      specCount: 1,
      cartPanelShow: false
    });
  },

  /**
   * 关闭规格选择面板
   */
  closeSpecPanel: function () {
    this.setData({ specPanelShow: false });
  },

  /**
   * 选择规格选项
   */
  selectSpec: function (e) {
    var specName = e.currentTarget.dataset.spec;
    var opt = e.currentTarget.dataset.opt;
    var selected = {};
    for (var key in this.data.specSelected) {
      if (this.data.specSelected.hasOwnProperty(key)) {
        selected[key] = this.data.specSelected[key];
      }
    }
    selected[specName] = opt;
    this.setData({ specSelected: selected });
  },

  /**
   * 规格面板：数量+1
   */
  specIncCount: function () {
    this.setData({ specCount: this.data.specCount + 1 });
  },

  /**
   * 规格面板：数量-1（最小为1）
   */
  specDecCount: function () {
    if (this.data.specCount > 1) {
      this.setData({ specCount: this.data.specCount - 1 });
    }
  },

  /**
   * 规格面板：加入购物车
   */
  addSpecToCart: function () {
    var dish = this.data.specPanelDish;
    var selected = this.data.specSelected;
    var count = this.data.specCount;

    if (!dish || !dish._id) return;

    // 构建规格文本和key
    var specsParts = [];
    var specsKeyParts = [];
    if (dish.specs && dish.specs.length) {
      for (var i = 0; i < dish.specs.length; i++) {
        var specName = dish.specs[i].name;
        var opt = selected[specName];
        if (opt) {
          specsParts.push(opt);
          specsKeyParts.push(opt);
        }
      }
    }
    var specsText = specsParts.join('/');
    var specsKey = specsKeyParts.join('_');

    // 加入购物车（不带事件坐标，仅弹跳动画）
    this._addDishToCart(dish, specsKey, specsText, null, count);

    // 关闭规格面板
    this.setData({ specPanelShow: false });
  },

  // ========== 购物车面板 ==========

  /**
   * 切换购物车面板显示/隐藏
   */
  toggleCartPanel: function () {
    if (this.data.cartPanelShow) {
      this.closeCartPanel();
    } else {
      this.openCartPanel();
    }
  },

  /**
   * 打开购物车面板
   */
  openCartPanel: function () {
    if (this.data.cart.length === 0) return;
    this.setData({ cartPanelShow: true, specPanelShow: false });
  },

  /**
   * 关闭购物车面板
   */
  closeCartPanel: function () {
    this.setData({ cartPanelShow: false });
  },

  /**
   * 清空购物车
   */
  clearCart: function () {
    var self = this;
    wx.showModal({
      title: '提示',
      content: '确定要清空购物车吗？',
      confirmText: '清空',
      cancelText: '取消',
      confirmColor: '#ff6b81',
      success: function (res) {
        if (res.confirm) {
          self.setData({ cart: [], cartPanelShow: false });
          self.updateCartCount();
          self.saveCartToStorage();
        }
      }
    });
  },

  /**
   * 购物车面板：某项数量+1
   */
  incCartItem: function (e) {
    var cartKey = e.currentTarget.dataset.cartKey;
    var cart = this.data.cart.slice();
    for (var i = 0; i < cart.length; i++) {
      if (cart[i].cartKey === cartKey) {
        cart[i].count = (cart[i].count || 1) + 1;
        break;
      }
    }
    this.setData({ cart: cart });
    this.updateCartCount();
    this.saveCartToStorage();
  },

  /**
   * 购物车面板：某项数量-1
   */
  decCartItem: function (e) {
    var cartKey = e.currentTarget.dataset.cartKey;
    var cart = this.data.cart.slice();
    for (var i = 0; i < cart.length; i++) {
      if (cart[i].cartKey === cartKey) {
        cart[i].count = (cart[i].count || 1) - 1;
        if (cart[i].count <= 0) {
          cart.splice(i, 1);
        }
        break;
      }
    }
    this.setData({ cart: cart });
    this.updateCartCount();
    this.saveCartToStorage();

    // 购物车空了，关闭面板
    if (cart.length === 0) {
      this.setData({ cartPanelShow: false });
    }
  },

  // ========== 页面导航 ==========

  /**
   * 去结算：将购物车数据存到 globalData，跳转到购物车页面
   */
  onGoToCart: function () {
    var app = getApp();
    app.globalData.role = 'girl';
    app.globalData.cartItems = this.data.cart;
    nav.switchTo('/pages/cart/cart');
  },

  /**
   * 跳转到订单页面
   */
  onGoToOrders: function () {
    var app = getApp();
    app.globalData.role = 'girl';
    nav.switchTo('/pages/orders/orders');
  },

  /**
   * 跳转到设置页面
   */
  onGoToSettings: function () {
    nav.switchTo('/pages/settings/settings');
  },

  /**
   * 切换角色
   */
  onSwitchRole: function () {
    wx.showModal({
      title: '切换角色',
      content: '确定要切换到厨师角色吗？',
      confirmText: '确定',
      cancelText: '取消',
      confirmColor: '#ff6b81',
      success: function (res) {
        if (res.confirm) {
          var app = getApp();
          app.globalData.role = 'boy';
          wx.redirectTo({
            url: '/pages/boy-home/boy-home'
          });
        }
      }
    });
  },

  // ========== 滚动联动 ==========

  _scrollPending: false,

  /**
   * 右侧菜品列表滚动时，检测当前可见的分类区块，更新左侧侧边栏高亮
   */
  bindMenuScroll: function (e) {
    var self = this;
    // 节流：每 100ms 处理一次
    if (self._scrollPending) return;
    self._scrollPending = true;
    setTimeout(function () {
      self._scrollPending = false;
      self._doScrollUpdate(e);
    }, 100);
  },

  /**
   * 实际执行滚动更新逻辑
   * 每次都重新测量各分类区块位置，确保坐标系正确
   */
  _doScrollUpdate: function (e) {
    var self = this;
    var scrollTop = e.detail ? e.detail.scrollTop : 0;

    // 点击分类触发的滚动动画期间，不更新高亮
    if (self._clickScrolling) return;

    var query = wx.createSelectorQuery();
    query.selectAll('.dish-group').boundingClientRect();
    query.select('.dish-scroll').boundingClientRect();
    query.exec(function (res) {
      if (!res || !res[0] || !res[1] || !res[0].length) return;
      var containerTop = res[1].top;
      var groups = self.data.filteredCategoryGroups;
      if (!groups || groups.length === 0) return;

      // 计算每个分类区块在内容中的实际偏移量
      // boundingClientRect.top 是相对于视口的，需要加上 scrollTop 才是内容偏移
      var tops = [];
      for (var i = 0; i < res[0].length; i++) {
        tops.push(res[0][i].top - containerTop + scrollTop);
      }

      // 找到当前 scrollTop 对应的分类
      var activeCategory = '';
      for (var i = tops.length - 1; i >= 0; i--) {
        if (scrollTop >= tops[i] - 10) {
          if (groups[i]) {
            activeCategory = groups[i].category;
          }
          break;
        }
      }

      if (activeCategory && activeCategory !== self.data.activeCategory) {
        self.setData({ activeCategory: activeCategory });
      }
    });
  },

  // ========== 通知 ==========

  /**
   * 检查通知数量
   */
  checkNotifications: async function () {
    try {
      var app = getApp();
      var phone = app.globalData.userPhone || wx.getStorageSync('phone') || '';
      if (!phone) return;
      var count = await api.getNotificationCount(phone);
      var hasNotif = false;
      if (count && typeof count === 'object') {
        hasNotif = count.newOrder > 0 || count.completed > 0 || count.partnerJoined > 0 || count.partnerUnbound > 0;
      }
      this.setData({ hasNotifications: hasNotif });
    } catch (err) {
      console.error('获取通知数量失败:', err);
    }
  },

  // 轮询检测伴侣是否解绑
  startPartnerPoll: function () {
    var self = this;
    var app = getApp();
    var phone = app.globalData.userPhone || wx.getStorageSync('phone') || '';
    if (!phone) return;

    // 清除旧定时器
    if (this.data._partnerPollTimer) {
      clearInterval(this.data._partnerPollTimer);
    }

    var poll = function () {
      api.getPartner(app.globalData.openid, phone).then(function (partner) {
        if (partner) {
          self.data._hadPartner = true;
          app.globalData.partner = partner;
        } else {
          if (self.data._hadPartner) {
            // 被对方解绑
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

  // 轮询监听订单状态变化（检测男方开始制作 / 完成订单 → 弹窗）
  // 用本地存储记录已通知过的状态，切换角色后也能检测到
  startWatchingOrders: function () {
    var self = this;
    var app = getApp();
    var phone = app.globalData.userPhone || wx.getStorageSync('phone') || '';
    if (!phone) return;

    var storageKey = 'girl_seen_status_' + phone;

    // 从本地存储加载已通知过的状态 { orderId: 'completed' }
    var seenStatus = {};
    try {
      var stored = wx.getStorageSync(storageKey);
      if (stored && typeof stored === 'object') {
        seenStatus = stored;
      }
    } catch (e) {}

    var saveSeen = function () {
      try { wx.setStorageSync(storageKey, seenStatus); } catch (e) {}
    };

    var poll = function () {
      api.getGirlOrders(phone).then(function (orders) {
        if (!orders || orders.length === 0) return;

        var notifIcon = '';
        var notifTitle = '';
        var notifDesc = '';
        var hasNewStatus = false;

        for (var i = 0; i < orders.length; i++) {
          var order = orders[i];
          var oid = order.orderId;
          if (!oid) continue;

          var prevStatus = seenStatus[oid] || '';
          var currStatus = order.status;

          // 状态发生变化
          if (prevStatus !== currStatus) {
            // pending → cooking：男方开始制作
            if (currStatus === 'cooking' && prevStatus !== 'cooking') {
              notifIcon = '👨‍🍳';
              notifTitle = '开始制作啦';
              notifDesc = 'Ta正在为你做菜，请耐心等待~';
              hasNewStatus = true;
            }

            // cooking/pending → completed：男方完成
            if (currStatus === 'completed' && prevStatus !== 'completed') {
              notifIcon = '🎉';
              notifTitle = '订单已完成';
              notifDesc = 'Ta已经做好啦，快去看看吧~';
              hasNewStatus = true;
            }

            seenStatus[oid] = currStatus;
          }
        }

        if (hasNewStatus) {
          self.showNotifPopup(notifIcon, notifTitle, notifDesc);
        }

        saveSeen();
      }).catch(function (err) {
        console.error('轮询订单失败:', err);
      });
    };

    // 立即执行一次，然后每5秒轮询
    poll();
    this.data._orderPollTimer = setInterval(poll, 5000);
  },

  // ========== 下拉刷新 ==========

  onPullDownRefresh: function () {
    var self = this;
    this.loadDishes().then(function () {
      wx.stopPullDownRefresh();
    });
  }
});