const api = require('../../utils/api');
const nav = require('../../utils/nav');

const EMOJI_LIST = [
  '🍅', '🥚', '🥒', '🍆', '🥕', '🌽', '🥔', '🍠',
  '🍗', '🍖', '🥩', '🐟', '🦐', '🦀', '🥬', '🧅',
  '🍜', '🍝', '🍙', '🍚', '🍞', '🥟', '🥠', '🍱',
  '🍰', '🍮', '🥧', '🍧', '🧁', '🍩', '🍪', '🍫',
  '🥣', '🍲', '🥘', '🍳', '🥞', '🧇', '🥓', '🧆',
  '🍵', '🥛', '☕', '🥤', '🍺', '🍷', '🥂', '🍯'
];

const categoryMap = [
  { key: 'home', label: '家常菜' },
  { key: 'soup', label: '汤羹' },
  { key: 'dessert', label: '甜点' },
  { key: 'noodle', label: '面食' }
];

Page({
  data: {
    dishes: [],
    filteredDishes: [],
    searchTerm: '',
    showSearchClear: false,
    categories: categoryMap,
    emojiList: EMOJI_LIST,
    showModal: false,
    showEmojiPanel: false,
    showSpecEdit: false,
    editId: null,
    form: {
      name: '',
      emoji: '',
      categoryIndex: 0,
      desc: '',
      time: '',
      specs: []
    },
    newSpecName: '',
    newSpecOptions: '',
    // 弹窗通知
    showNotif: false,
    notifIcon: '',
    notifTitle: '',
    notifDesc: '',
    _notifTimer: null,
    _dishNotifPollTimer: null
  },

  onLoad() {
    this.loadDishes();
  },

  onShow() {
    this.loadDishes();
    this.startDishNotifPoll();
  },

  onHide() {
    if (this.data._dishNotifPollTimer) {
      clearInterval(this.data._dishNotifPollTimer);
      this.data._dishNotifPollTimer = null;
    }
  },

  onUnload() {
    if (this.data._dishNotifPollTimer) {
      clearInterval(this.data._dishNotifPollTimer);
      this.data._dishNotifPollTimer = null;
    }
    if (this.data._notifTimer) {
      clearTimeout(this.data._notifTimer);
    }
  },

  // ========== 菜品通知轮询 ==========

  startDishNotifPoll() {
    var self = this;
    // 延迟 3 秒后开始轮询，避免页面加载时误弹
    setTimeout(function () {
      self.checkDishNotif();
    }, 3000);
    this.data._dishNotifPollTimer = setInterval(function () {
      self.checkDishNotif();
    }, 15000);
  },

  async checkDishNotif() {
    var self = this;
    var app = getApp();
    var phone = app.globalData.userPhone || wx.getStorageSync('phone') || '';
    if (!phone) return;

    try {
      // 用云函数查未读通知
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
        self.setData({ showNotif: true, notifIcon: icon, notifTitle: title, notifDesc: dishName });
        if (self.data._notifTimer) clearTimeout(self.data._notifTimer);
        self.data._notifTimer = setTimeout(function () {
          self.setData({ showNotif: false });
        }, 3000);

        // 用云函数删除所有已处理的通知
        var ids = notifs.map(function (n) { return n._id; });
        await wx.cloud.callFunction({
          name: 'notification',
          data: { action: 'deleteNotifs', ids: ids }
        });

        // 静默刷新菜品
        self.loadDishesSilent();
      }
    } catch (e) {
      console.error('检查菜品通知失败:', e);
    }
  },

  // 静默加载菜品（不显示 loading）
  async loadDishesSilent() {
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

  async loadDishes() {
    wx.showLoading({ title: '加载中...' });
    try {
      var app = getApp();
      var myPhone = app.globalData.userPhone || wx.getStorageSync('phone') || '';

      // 获取伴侣手机号，合并双方菜品
      var phones = [myPhone];
      try {
        var partner = await api.getPartner(app.globalData.openid, myPhone);
        if (partner && partner.phone) {
          phones.push(partner.phone);
        }
      } catch (e) {}

      const res = await wx.cloud.callFunction({
        name: 'dish',
        data: { action: 'list', phones: phones }
      });
      var dishes = (res.result.dishes || res.result.data || []).map(function (d) {
        var catLabel = '';
        for (var i = 0; i < categoryMap.length; i++) {
          if (categoryMap[i].key === d.category) { catLabel = categoryMap[i].label; break; }
        }
        return Object.assign({}, d, { categoryLabel: catLabel || d.category });
      });
      this.setData({ dishes: dishes, filteredDishes: dishes });
      wx.hideLoading();
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  showAddDialog() {
    this.setData({
      showModal: true,
      showEmojiPanel: false,
      showSpecEdit: false,
      editId: null,
      form: {
        name: '',
        emoji: '',
        categoryIndex: 0,
        desc: '',
        time: '',
        specs: []
      },
      newSpecName: '',
      newSpecOptions: ''
    });
  },

  editDish(e) {
    var index = e.currentTarget.dataset.index;
    var dish = this.data.dishes[index];
    if (!dish) return;

    var catIdx = 0;
    for (var i = 0; i < categoryMap.length; i++) {
      if (categoryMap[i].key === dish.category) { catIdx = i; break; }
    }

    // 加载已有规格数据，做深拷贝避免直接修改原始数据
    var specs = [];
    if (Array.isArray(dish.specs)) {
      for (var s = 0; s < dish.specs.length; s++) {
        var specItem = dish.specs[s];
        specs.push({
          name: specItem.name || '',
          options: Array.isArray(specItem.options) ? specItem.options.slice() : []
        });
      }
    }

    this.setData({
      showModal: true,
      showEmojiPanel: false,
      showSpecEdit: specs.length > 0,
      editId: dish._id,
      form: {
        name: dish.name || '',
        emoji: dish.emoji || '',
        categoryIndex: catIdx,
        desc: dish.desc || '',
        time: dish.time || '',
        specs: specs
      },
      newSpecName: '',
      newSpecOptions: ''
    });
  },

  // 整体更新 form 对象，避免路径写法的兼容性问题
  onFieldChange(e) {
    var field = e.currentTarget.dataset.field;
    var value = e.detail.value;
    var form = this.data.form;
    var newForm = {
      name: form.name,
      emoji: form.emoji,
      categoryIndex: form.categoryIndex,
      desc: form.desc,
      time: form.time,
      specs: form.specs
    };
    newForm[field] = value;
    this.setData({ form: newForm });
  },

  onCategoryChange(e) {
    var form = this.data.form;
    var newForm = {
      name: form.name,
      emoji: form.emoji,
      categoryIndex: parseInt(e.detail.value),
      desc: form.desc,
      time: form.time,
      specs: form.specs
    };
    this.setData({ form: newForm });
  },

  toggleEmojiPanel() {
    this.setData({ showEmojiPanel: !this.data.showEmojiPanel });
  },

  pickEmoji(e) {
    var emoji = e.currentTarget.dataset.emoji;
    var form = this.data.form;
    var newForm = {
      name: form.name,
      emoji: emoji,
      categoryIndex: form.categoryIndex,
      desc: form.desc,
      time: form.time,
      specs: form.specs
    };
    this.setData({ form: newForm, showEmojiPanel: false });
  },

  // 阻止冒泡的空函数
  noop() {},

  // ========== 规格编辑 ==========

  toggleSpecEdit() {
    this.setData({ showSpecEdit: !this.data.showSpecEdit });
  },

  onSpecNameInput(e) {
    this.setData({ newSpecName: e.detail.value });
  },

  onSpecOptionsInput(e) {
    this.setData({ newSpecOptions: e.detail.value });
  },

  addSpec() {
    var name = (this.data.newSpecName || '').trim();
    var optionsStr = (this.data.newSpecOptions || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入规格名称', icon: 'none' });
      return;
    }
    // 按中文/英文逗号分隔选项，去除空项
    var options = optionsStr.split(/[,，]/).map(function (o) { return o.trim(); }).filter(function (o) { return o.length > 0; });
    if (options.length === 0) {
      wx.showToast({ title: '请至少输入一个选项', icon: 'none' });
      return;
    }

    var form = this.data.form;
    var specs = (form.specs || []).slice();
    specs.push({ name: name, options: options });

    this.setData({
      'form.specs': specs,
      newSpecName: '',
      newSpecOptions: ''
    });
  },

  removeSpec(e) {
    var sIdx = e.currentTarget.dataset.index;
    var form = this.data.form;
    var specs = (form.specs || []).slice();
    specs.splice(sIdx, 1);
    this.setData({ 'form.specs': specs });
  },

  removeSpecOption(e) {
    var sIdx = e.currentTarget.dataset.sindex;
    var oIdx = e.currentTarget.dataset.oindex;
    var form = this.data.form;
    var specs = (form.specs || []).slice();
    if (!specs[sIdx]) return;
    // 深拷贝该规格组的选项数组，避免直接修改引用
    var newOptions = (specs[sIdx].options || []).slice();
    newOptions.splice(oIdx, 1);
    specs[sIdx] = { name: specs[sIdx].name, options: newOptions };

    // 若该规格组已无选项，则移除整个规格组
    if (newOptions.length === 0) {
      specs.splice(sIdx, 1);
    }
    this.setData({ 'form.specs': specs });
  },

  closeModal() {
    this.setData({ showModal: false });
  },

  async saveDish() {
    var form = this.data.form;
    var editId = this.data.editId;

    if (!form.name || !form.name.trim()) {
      wx.showToast({ title: '请输入菜品名称', icon: 'none' });
      return;
    }
    if (!form.emoji || !form.emoji.trim()) {
      wx.showToast({ title: '请输入Emoji图标', icon: 'none' });
      return;
    }

    wx.showLoading({ title: editId ? '保存中...' : '添加中...' });
    try {
      var app = getApp();
      var chefPhone = app.globalData.userPhone || wx.getStorageSync('phone') || '';
      var category = categoryMap[form.categoryIndex].key;
      var requestData = {
        action: editId ? 'update' : 'add',
        name: form.name,
        emoji: form.emoji,
        category: category,
        desc: form.desc,
        time: form.time,
        specs: form.specs || [],
        chefPhone: chefPhone
      };
      if (editId) {
        requestData.dishId = editId;
      }

      console.log('保存菜品，请求数据:', JSON.stringify(requestData));

      var res = await wx.cloud.callFunction({
        name: 'dish',
        data: requestData
      });

      console.log('保存菜品，返回结果:', JSON.stringify(res.result));

      if (res.result && res.result.code === 0) {
        wx.hideLoading();
        wx.showToast({ title: editId ? '修改成功' : '添加成功', icon: 'success' });
        this.closeModal();
        this.loadDishes();
      } else {
        wx.hideLoading();
        wx.showToast({ title: '保存失败: ' + (res.result ? res.result.msg : '未知错误'), icon: 'none', duration: 3000 });
      }
    } catch (e) {
      wx.hideLoading();
      console.error('保存菜品失败:', e);
      wx.showToast({ title: '操作失败: ' + (e.message || ''), icon: 'none', duration: 3000 });
    }
  },

  deleteDish(e) {
    var id = e.currentTarget.dataset.id;
    var name = e.currentTarget.dataset.name;
    var self = this;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除「' + name + '」吗？',
      success: async function (res) {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          try {
            var app = getApp();
            var chefPhone = app.globalData.userPhone || wx.getStorageSync('phone') || '';
            await wx.cloud.callFunction({
              name: 'dish',
              data: { action: 'delete', dishId: id, chefPhone: chefPhone }
            });
            wx.hideLoading();
            wx.showToast({ title: '已删除', icon: 'success' });
            self.loadDishes();
          } catch (e) {
            wx.hideLoading();
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  // ========== 搜索 ==========
  onSearchInput(e) {
    var value = e.detail.value;
    this.setData({
      searchTerm: value,
      showSearchClear: value.length > 0
    });
    this.applySearch();
  },

  onClearSearch() {
    this.setData({
      searchTerm: '',
      showSearchClear: false
    });
    this.applySearch();
  },

  applySearch() {
    var term = this.data.searchTerm.trim().toLowerCase();
    var dishes = this.data.dishes;
    if (!term) {
      this.setData({ filteredDishes: dishes });
      return;
    }
    var filtered = dishes.filter(function (d) {
      return (d.name || '').toLowerCase().indexOf(term) !== -1;
    });
    this.setData({ filteredDishes: filtered });
  },

  onBack() {
    nav.switchTo('/pages/boy-home/boy-home');
  }
});
