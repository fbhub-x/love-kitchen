// ==================== 缓存变量 ====================
let dishesCache = [];
let categoriesCache = [];
let lastCreatedOrder = null;

// ==================== 状态管理 ====================
let state = {
    currentRole: null,
    currentCategory: 'all',
    user: null,
    partner: null,
    myInviteCode: null,
    orderNote: '',
    bindPollTimer: null,
    boyPollTimer: null,
    girlPollTimer: null,
    orderPollTimer: null,
    menuScrollTimer: null,
    searchTerm: ''
};

// ==================== 数据获取 ====================
async function getAllDishes() {
    try {
        const res = await API.getDishes();
        dishesCache = res.dishes;
        return dishesCache;
    } catch (e) {
        showToast('加载菜品失败');
        return [];
    }
}

function findDish(id) {
    return dishesCache.find(d => String(d.id) === String(id));
}

// 获取所有分类名称对象
async function getAllCategories() {
    try {
        const res = await API.getCategories();
        categoriesCache = res.categories;
        const all = {};
        categoriesCache.forEach(cat => {
            all[cat.key] = cat.label;
        });
        return all;
    } catch (e) {
        // 返回默认分类
        return {
            'home': '家常菜',
            'soup': '汤羹',
            'dessert': '甜点',
            'noodle': '面食'
        };
    }
}

// 获取带图标的分类列表（用于左侧栏）
async function getCategoryList() {
    const defaultCats = [
        { key: 'home', icon: '🍳', label: '家常菜' },
        { key: 'soup', icon: '🥣', label: '汤羹' },
        { key: 'dessert', icon: '🍰', label: '甜点' },
        { key: 'noodle', icon: '🍜', label: '面食' }
    ];
    try {
        const catsRes = await API.getCategories();
        const cats = catsRes.categories;
        cats.forEach(cat => {
            // 跳过系统默认分类，只追加自定义分类
            const isSystem = ['home', 'soup', 'dessert', 'noodle'].includes(cat.key);
            if (!isSystem) {
                defaultCats.push({ key: cat.key, icon: cat.icon, label: cat.label });
            }
        });
    } catch (e) {
        // 使用默认分类
    }
    return defaultCats;
}

// ==================== 工具函数 ====================
function generateOrderId() {
    const now = new Date();
    return `ORD${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
}

function formatTime(dateStr) {
    const date = new Date(dateStr);
    return `${date.getMonth()+1}月${date.getDate()}日 ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('active');
    setTimeout(() => {
        toast.classList.remove('active');
    }, 2000);
}

function switchPage(pageId) {
    // 离开绑定页时停止轮询
    if (pageId !== 'bind-page' && state.bindPollTimer) {
        clearInterval(state.bindPollTimer);
        state.bindPollTimer = null;
    }
    // 离开男方首页时停止轮询
    if (pageId !== 'boy-home-page' && state.boyPollTimer) {
        clearInterval(state.boyPollTimer);
        state.boyPollTimer = null;
    }
    // 离开女方首页时停止轮询
    if (pageId !== 'girl-home-page' && state.girlPollTimer) {
        clearInterval(state.girlPollTimer);
        state.girlPollTimer = null;
    }
    // 离开女方首页时解绑菜单滚动
    if (pageId !== 'girl-home-page') {
        unbindMenuScroll();
    }
    // 离开订单页时停止轮询
    if (pageId !== 'orders-page' && state.orderPollTimer) {
        clearInterval(state.orderPollTimer);
        state.orderPollTimer = null;
    }
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageId).classList.add('active');
    window.scrollTo(0, 0);
}

// ==================== 页面渲染 ====================
async function renderMenu() {
    // 渲染左侧分类栏
    const sidebar = document.getElementById('menu-sidebar');
    const categories = await getCategoryList();
    
    sidebar.innerHTML = categories.map(cat => `
        <button class="sidebar-item ${state.currentCategory === cat.key ? 'active' : ''}" 
                data-category="${cat.key}" 
                onclick="filterCategory('${cat.key}')">
            <span class="sidebar-icon">${cat.icon}</span>
            <span class="sidebar-label">${cat.label}</span>
        </button>
    `).join('');
    
    // 渲染右侧菜品列表
    const grid = document.getElementById('menu-grid');
    const allDishes = await getAllDishes();
    
    if (state.currentCategory === 'all') {
        // 全部模式：按分类分组渲染，每组带标题
        let html = '';
        for (const cat of categories) {
            const catDishes = allDishes.filter(dish => dish.category === cat.key);
            if (catDishes.length === 0) continue;
            // 搜索过滤
            let filtered = catDishes;
            if (state.searchTerm) {
                filtered = filtered.filter(dish => 
                    dish.name.toLowerCase().includes(state.searchTerm) || 
                    (dish.desc && dish.desc.toLowerCase().includes(state.searchTerm))
                );
            }
            if (filtered.length === 0) continue;
            html += `<div class="category-section" data-category="${cat.key}">`;
            html += `<div class="category-section-title">${cat.icon} ${cat.label}</div>`;
            html += filtered.map(dish => `
                <div class="dish-card">
                    <div class="dish-image">${dish.emoji}</div>
                    <div class="dish-info">
                        <div class="dish-name">${dish.name}</div>
                        <div class="dish-desc">${dish.desc}</div>
                        <div class="dish-footer">
                            <span class="dish-time">⏱️ ${dish.time}</span>
                            <button class="add-btn" onclick="event.stopPropagation(); addToCart(${dish.id})">+</button>
                        </div>
                    </div>
                </div>
            `).join('');
            html += `</div>`;
        }
        if (!html) {
            grid.innerHTML = `<div style="text-align:center;padding:40px 0;color:var(--text-secondary);">
                <div style="font-size:40px;margin-bottom:8px;">🔍</div>
                <p>没有找到相关菜品</p>
            </div>`;
        } else {
            grid.innerHTML = html;
        }
    } else {
        // 单个分类模式
        let filtered = allDishes.filter(dish => dish.category === state.currentCategory);
        if (state.searchTerm) {
            filtered = filtered.filter(dish => 
                dish.name.toLowerCase().includes(state.searchTerm) || 
                (dish.desc && dish.desc.toLowerCase().includes(state.searchTerm))
            );
        }
        if (filtered.length === 0) {
            grid.innerHTML = `<div style="text-align:center;padding:40px 0;color:var(--text-secondary);">
                <div style="font-size:40px;margin-bottom:8px;">${state.searchTerm ? '🔍' : '🍽️'}</div>
                <p>${state.searchTerm ? '没有找到相关菜品' : '该分类暂无菜品'}</p>
            </div>`;
        } else {
            grid.innerHTML = filtered.map(dish => `
                <div class="dish-card">
                    <div class="dish-image">${dish.emoji}</div>
                    <div class="dish-info">
                        <div class="dish-name">${dish.name}</div>
                        <div class="dish-desc">${dish.desc}</div>
                        <div class="dish-footer">
                            <span class="dish-time">⏱️ ${dish.time}</span>
                            <button class="add-btn" onclick="event.stopPropagation(); addToCart(${dish.id})">+</button>
                        </div>
                    </div>
                </div>
            `).join('');
        }
    }
    
    // 绑定滚动监听（仅在全部模式下）
    if (state.currentCategory === 'all') {
        bindMenuScroll();
    } else {
        unbindMenuScroll();
    }
}

// 绑定菜单滚动监听
function bindMenuScroll() {
    const menuMain = document.querySelector('.menu-main');
    if (!menuMain) return;
    // 先解绑旧的
    unbindMenuScroll();
    state.menuScrollTimer = menuMain;
    menuMain.addEventListener('scroll', onMenuScroll, { passive: true });
    // 初始触发一次
    onMenuScroll();
}

// 解绑菜单滚动监听
function unbindMenuScroll() {
    if (state.menuScrollTimer) {
        state.menuScrollTimer.removeEventListener('scroll', onMenuScroll);
        state.menuScrollTimer = null;
    }
}

// 滚动时更新左侧分类栏高亮
function onMenuScroll() {
    const menuMain = document.querySelector('.menu-main');
    if (!menuMain) return;
    const sections = menuMain.querySelectorAll('.category-section');
    if (sections.length === 0) return;
    
    const containerTop = menuMain.getBoundingClientRect().top;
    let activeCategory = 'all';
    
    sections.forEach(section => {
        const rect = section.getBoundingClientRect();
        const sectionTop = rect.top - containerTop;
        // 如果 section 的顶部已经滚过容器顶部（或接近），则激活此分类
        if (sectionTop <= 60) {
            activeCategory = section.dataset.category;
        }
    });
    
    // 如果第一个 section 还没滚出，则保持全部
    const firstSection = sections[0].getBoundingClientRect();
    if (firstSection.top - containerTop > 60) {
        activeCategory = 'all';
    }
    
    updateSidebarActive(activeCategory);
}

// 更新左侧分类栏高亮
function updateSidebarActive(category) {
    if (state.currentCategory !== 'all') return; // 非全部模式不更新
    const items = document.querySelectorAll('.sidebar-item');
    items.forEach(item => {
        if (item.dataset.category === category) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

// 切换分类（再次点击同一分类回到全部）
async function filterCategory(category) {
    state.currentCategory = state.currentCategory === category ? 'all' : category;
    // 重置搜索
    const searchInput = document.getElementById('girl-search-input');
    if (searchInput) searchInput.value = '';
    state.searchTerm = '';
    document.getElementById('girl-search-clear').style.display = 'none';
    await renderMenu();
}

// 女方搜索菜品
async function onGirlSearch(value) {
    state.searchTerm = value.trim().toLowerCase();
    document.getElementById('girl-search-clear').style.display = value ? 'block' : 'none';
    await renderMenu();
}

function clearGirlSearch() {
    document.getElementById('girl-search-input').value = '';
    state.searchTerm = '';
    document.getElementById('girl-search-clear').style.display = 'none';
    renderMenu();
}

// 男方搜索菜品
async function onDishSearch(value) {
    state.searchTerm = value.trim().toLowerCase();
    document.getElementById('dish-search-clear').style.display = value ? 'block' : 'none';
    await renderDishManage();
}

function clearDishSearch() {
    document.getElementById('dish-search-input').value = '';
    state.searchTerm = '';
    document.getElementById('dish-search-clear').style.display = 'none';
    renderDishManage();
}

async function renderCart() {
    const content = document.getElementById('cart-content');
    const footer = document.getElementById('cart-footer');
    
    let cartItems = [];
    try {
        const res = await API.getCart();
        cartItems = res.cart;
    } catch (e) {
        showToast('加载购物车失败');
        return;
    }
    
    if (cartItems.length === 0) {
        content.innerHTML = `
            <div class="empty-cart">
                <div class="emoji">🛒</div>
                <p>购物车是空的</p>
                <p style="font-size: 14px; margin-top: 8px;">快去挑选喜欢的菜品吧~</p>
            </div>
        `;
        footer.style.display = 'none';
        document.getElementById('cart-note-area').style.display = 'none';
    } else {
        // 确保 dishesCache 已加载
        if (dishesCache.length === 0) {
            await getAllDishes();
        }
        content.innerHTML = cartItems.map(item => {
            const dish = findDish(item.dishId || item.id);
            if (!dish) return '';
            return `
                <div class="cart-item">
                    <div class="cart-item-image">${dish.emoji}</div>
                    <div class="cart-item-info">
                        <div class="cart-item-name">${dish.name}</div>
                        <div class="cart-item-desc">${dish.desc}</div>
                    </div>
                    <div class="cart-item-actions">
                        <button class="quantity-btn" onclick="updateQuantity(${item.dishId}, ${item.id}, -1)">−</button>
                        <span class="quantity">${item.quantity}</span>
                        <button class="quantity-btn" onclick="updateQuantity(${item.dishId}, ${item.id}, 1)">+</button>
                    </div>
                </div>
            `;
        }).join('');
        footer.style.display = 'flex';
        
        // 显示留言区
        const noteArea = document.getElementById('cart-note-area');
        const noteText = document.getElementById('cart-note-text');
        noteArea.style.display = 'block';
        if (state.orderNote) {
            noteText.textContent = state.orderNote;
            noteText.style.color = 'var(--text-primary)';
        } else {
            noteText.textContent = '点击给Ta留句话...';
            noteText.style.color = 'var(--text-light)';
        }
    }
    
    const totalCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    document.getElementById('cart-count').textContent = totalCount;
    document.getElementById('cart-badge').textContent = totalCount;
    document.getElementById('cart-badge').style.display = totalCount > 0 ? 'block' : 'none';
}

async function renderOrders() {
    const content = document.getElementById('orders-content');
    
    let orders = [];
    try {
        const res = await API.getOrders();
        orders = res.orders;
    } catch (e) {
        showToast('加载订单失败');
        return;
    }

    if (orders.length === 0) {
        content.innerHTML = `
            <div class="empty-orders">
                <div class="emoji">📋</div>
                <p>还没有订单哦</p>
            </div>
        `;
        return;
    }
    
    // 确保 dishesCache 已加载
    if (dishesCache.length === 0) {
        await getAllDishes();
    }
    
    const sortedOrders = [...orders].sort((a, b) => new Date(b.time) - new Date(a.time));
    
    content.innerHTML = sortedOrders.map(order => `
        <div class="order-card" onclick="showOrderDetail('${order.id}')">
            <div class="order-header">
                <span class="order-id">订单 ${String(order.id).slice(-6)}</span>
                <span class="order-status status-${order.status}">${getStatusText(order.status)}</span>
            </div>
            <div class="order-items">
                ${order.items.slice(0, 3).map(item => {
                    const dish = findDish(item.dishId || item.id);
                    if (!dish) return '';
                    return `
                        <div class="order-item">
                            <span class="order-item-emoji">${dish.emoji}</span>
                            <span class="order-item-name">${dish.name}</span>
                            <span class="order-item-quantity">x${item.quantity}</span>
                        </div>
                    `;
                }).join('')}
                ${order.items.length > 3 ? `<div style="color: var(--text-light); font-size: 13px; margin-top: 4px;">还有 ${order.items.length - 3} 道菜...</div>` : ''}
            </div>
            ${order.orderNote ? `<div class="order-note-display"><span>💬</span><span>${order.orderNote}</span></div>` : ''}
            <div class="order-footer">
                <span class="order-time">${formatTime(order.time)}</span>
            </div>
        </div>
    `).join('');
}

async function renderBoyOrders() {
    const list = document.getElementById('boy-orders-list');
    const content = document.getElementById('boy-orders-content');
    
    let orders = [];
    try {
        const res2 = await API.getOrders();
        orders = res2.orders;
    } catch (e) {
        showToast('加载订单失败');
        return;
    }
    
    // 确保 dishesCache 已加载
    if (dishesCache.length === 0) {
        await getAllDishes();
    }
    
    const pendingOrders = orders.filter(o => o.status === 'pending').sort((a, b) => new Date(b.time) - new Date(a.time));
    const allOrders = [...orders].sort((a, b) => new Date(b.time) - new Date(a.time));
    
    // 更新统计
    const pendingCount = pendingOrders.length;
    const completedCount = orders.filter(o => o.status === 'completed').length;
    document.getElementById('pending-count').textContent = pendingCount;
    document.getElementById('completed-count').textContent = completedCount;
    document.getElementById('total-count').textContent = orders.length;
    document.getElementById('boy-badge').textContent = pendingCount;
    document.getElementById('boy-badge').style.display = pendingCount > 0 ? 'block' : 'none';
    
    // 渲染首页最新订单
    if (pendingOrders.length === 0) {
        list.innerHTML = `
            <div class="empty-orders" style="padding: 40px 20px;">
                <div class="emoji">🎉</div>
                <p>没有待做订单</p>
                <p style="font-size: 14px; margin-top: 8px;">可以休息一会儿啦~</p>
            </div>
        `;
    } else {
        list.innerHTML = pendingOrders.slice(0, 3).map(order => `
            <div class="order-card">
                <div class="order-header">
                    <span class="order-id">订单 ${String(order.id).slice(-6)}</span>
                    <span class="order-status status-${order.status}">${getStatusText(order.status)}</span>
                </div>
                <div class="order-items">
                    ${order.items.map(item => {
                        const dish = findDish(item.dishId || item.id);
                        if (!dish) return '';
                        return `
                            <div class="order-item">
                                <span class="order-item-emoji">${dish.emoji}</span>
                                <span class="order-item-name">${dish.name}</span>
                                <span class="order-item-quantity">x${item.quantity}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
                ${order.orderNote ? `<div class="order-note-display"><span>💬</span><span>${order.orderNote}</span></div>` : ''}
                <div class="order-footer">
                    <span class="order-time">${formatTime(order.time)}</span>
                    <div class="order-actions">
                        <button class="action-btn primary" onclick="startCooking('${order.id}', event)">开始做菜</button>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    // 渲染全部订单页
    if (allOrders.length === 0) {
        content.innerHTML = `
            <div class="empty-orders">
                <div class="emoji">📋</div>
                <p>还没有订单哦</p>
            </div>
        `;
    } else {
        content.innerHTML = allOrders.map(order => `
            <div class="order-card">
                <div class="order-header">
                    <span class="order-id">订单 ${String(order.id).slice(-6)}</span>
                    <span class="order-status status-${order.status}">${getStatusText(order.status)}</span>
                </div>
                <div class="order-items">
                    ${order.items.map(item => {
                        const dish = findDish(item.dishId || item.id);
                        if (!dish) return '';
                        return `
                            <div class="order-item">
                                <span class="order-item-emoji">${dish.emoji}</span>
                                <span class="order-item-name">${dish.name}</span>
                                <span class="order-item-quantity">x${item.quantity}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
                ${order.orderNote ? `<div class="order-note-display"><span>💬</span><span>${order.orderNote}</span></div>` : ''}
                <div class="order-footer">
                    <span class="order-time">${formatTime(order.time)}</span>
                    <div class="order-actions">
                        ${order.status === 'pending' ? `<button class="action-btn primary" onclick="startCooking('${order.id}', event)">开始做菜</button>` : ''}
                        ${order.status === 'cooking' ? `<button class="action-btn success" onclick="completeOrder('${order.id}', event)">完成</button>` : ''}
                    </div>
                </div>
            </div>
        `).join('');
    }
}

function getStatusText(status) {
    const map = {
        'pending': '待接单',
        'cooking': '制作中',
        'completed': '已完成'
    };
    return map[status] || status;
}

// ==================== 交互功能 ====================
function selectRole(role) {
    state.currentRole = role;
    if (role === 'girl') {
        showGirlHome();
    } else {
        showBoyHome();
    }
}

function switchRole() {
    state.currentRole = state.currentRole === 'girl' ? 'boy' : 'girl';
    if (state.currentRole === 'girl') {
        showGirlHome();
    } else {
        showBoyHome();
    }
}

async function showGirlHome() {
    switchPage('girl-home-page');
    await renderMenu();
    updateNavActive('girl-home-page');
    
    // 同步搜索框状态
    const searchInput = document.getElementById('girl-search-input');
    if (searchInput) {
        searchInput.value = state.searchTerm;
        document.getElementById('girl-search-clear').style.display = state.searchTerm ? 'block' : 'none';
    }
    
    // 检查是否有新完成的订单通知
    await checkGirlNotifications();
    await checkPartnerNotifications();
    await updateNotificationBadges();
    
    // 启动轮询：每3秒检查通知
    if (state.girlPollTimer) clearInterval(state.girlPollTimer);
    state.girlPollTimer = setInterval(async () => {
        const banner = document.getElementById('notification-banner');
        if (!banner.classList.contains('show')) {
            await checkGirlNotifications();
            await checkPartnerNotifications();
        }
    }, 3000);
}

async function showBoyHome() {
    switchPage('boy-home-page');
    await renderBoyOrders();
    updateNavActive('boy-home-page');
    
    // 检查是否有新订单通知
    await checkBoyNotifications();
    await checkPartnerNotifications();
    await updateNotificationBadges();
    
    // 启动轮询：每3秒刷新订单列表和新通知
    if (state.boyPollTimer) clearInterval(state.boyPollTimer);
    state.boyPollTimer = setInterval(async () => {
        await renderBoyOrders();
        // 检查是否有新通知（仅当 banner 未显示时）
        const banner = document.getElementById('notification-banner');
        if (!banner.classList.contains('show')) {
            await checkBoyNotifications();
            await checkPartnerNotifications();
        }
    }, 3000);
}

function updateNavActive(pageId) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    if (pageId === 'girl-home-page') {
        document.querySelector('#girl-home-page .nav-btn:nth-child(1)').classList.add('active');
    } else if (pageId === 'boy-home-page') {
        document.querySelector('#boy-home-page .nav-btn:nth-child(1)').classList.add('active');
    }
}

async function showCart() {
    switchPage('cart-page');
    await renderCart();
}

async function showOrders() {
    switchPage('orders-page');
    await renderOrders();
    
    // 启动轮询：每3秒刷新订单状态
    if (state.orderPollTimer) clearInterval(state.orderPollTimer);
    state.orderPollTimer = setInterval(async () => {
        await renderOrders();
    }, 3000);
}

async function showBoyOrders() {
    switchPage('boy-orders-page');
    await renderBoyOrders();
}

function goBackHome() {
    if (state.currentRole === 'girl') {
        showGirlHome();
    } else {
        showBoyHome();
    }
}

async function addToCart(dishId) {
    event.stopPropagation();
    try {
        await API.addToCart({ dishId: dishId, quantity: 1 });
    } catch (e) {
        showToast('添加失败');
        return;
    }
    await renderCart();
    
    // 飘心动画
    if (dishesCache.length === 0) {
        await getAllDishes();
    }
    const dish = findDish(dishId);
    if (dish) {
        const emojis = ['❤️', '💕', '💖', '🥰', '😋', '🤤'];
        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
        spawnFloatingEmoji(randomEmoji);
        showToast(`${dish.emoji} ${dish.name} 已加入~`);
    }
}

// ==================== 飘心动画 ====================
function spawnFloatingEmoji(emoji) {
    const el = document.createElement('div');
    el.textContent = emoji;
    
    // 随机起始位置（限制在 app 宽度范围内）
    const appWidth = Math.min(window.innerWidth, 430);
    const appOffset = (window.innerWidth - appWidth) / 2;
    const startX = appOffset + Math.random() * (appWidth * 0.6) + appWidth * 0.2;
    const scale = 0.8 + Math.random() * 0.8;
    const duration = 2.5 + Math.random() * 1.5;
    
    // 直接附加到 document.body，全部使用内联样式
    el.style.cssText = 
        'position:fixed;' +
        'bottom:80px;' +
        'left:' + startX + 'px;' +
        'font-size:' + (28 * scale) + 'px;' +
        'pointer-events:none;' +
        'text-shadow:0 2px 8px rgba(255,107,138,0.3);' +
        'z-index:99999;' +
        'opacity:0;' +
        'will-change:transform,opacity;' +
        'animation:floatUp ' + duration + 's ease-out forwards;';
    
    document.body.appendChild(el);
    
    el.addEventListener('animationend', function() {
        el.remove();
    });
    
    setTimeout(() => {
        if (el.parentNode) el.remove();
    }, duration * 1000 + 500);
}

// ==================== 通知系统 ====================
let notificationTimer = null;
let notificationCallback = null;

// 更新角色切换按钮上的通知红点
async function updateNotificationBadges() {
    try {
        const data = await API.getNotificationCount();
        const girlDot = document.getElementById('girl-role-dot');
        if (girlDot) girlDot.style.display = (data.newOrder || 0) > 0 ? 'block' : 'none';
        const boyDot = document.getElementById('boy-role-dot');
        if (boyDot) boyDot.style.display = (data.completed || 0) > 0 ? 'block' : 'none';
    } catch (e) {
        // 静默失败
    }
}

function showNotification(icon, text, callback) {
    const banner = document.getElementById('notification-banner');
    if (!banner) return;
    
    const iconEl = document.getElementById('notification-icon');
    const textEl = document.getElementById('notification-text');
    
    iconEl.textContent = icon;
    textEl.textContent = text;
    notificationCallback = callback || null;
    
    // 先重置到隐藏状态
    banner.style.transform = 'translateX(-50%) translateY(-200px)';
    
    // 强制 reflow
    void banner.offsetWidth;
    
    // 添加 show 类并用内联样式覆盖
    banner.classList.add('show');
    banner.style.transform = 'translateX(-50%) translateY(0px)';
    
    // 重置图标动画
    iconEl.style.animation = 'none';
    void iconEl.offsetWidth;
    iconEl.style.animation = '';
    
    // 5秒后自动消失
    clearTimeout(notificationTimer);
    notificationTimer = setTimeout(() => {
        dismissNotification();
    }, 5000);
}

function dismissNotification() {
    const banner = document.getElementById('notification-banner');
    if (!banner) return;
    banner.classList.remove('show');
    banner.style.transform = 'translateX(-50%) translateY(-200px)';
    clearTimeout(notificationTimer);
    notificationCallback = null;
}

function clickNotification() {
    if (notificationCallback) {
        const cb = notificationCallback;
        dismissNotification();
        cb();
    } else {
        dismissNotification();
    }
}

// 男方进入首页时，检查是否有新订单
async function checkBoyNotifications() {
    try {
        const data = await API.getNotificationCount();
        if (data.newOrder > 0) {
            showNotification('🔔', `收到新订单！共${data.newOrder}个新订单`, () => {
                showBoyOrders();
            });
        }
        await API.markNotificationsRead('new_order');
    } catch (e) {
        // 静默失败
    }
    await updateNotificationBadges();
}

// 女方进入首页时，检查是否有新完成的订单
async function checkGirlNotifications() {
    try {
        const data = await API.getNotificationCount();
        if (data.completed > 0) {
            showNotification('🎉', `Ta做好菜啦！快去享用吧~`, () => {
                showOrders();
            });
        }
        await API.markNotificationsRead('completed');
    } catch (e) {
        // 静默失败
    }
    await updateNotificationBadges();
}

// 检查是否有伴侣加入/解除通知
async function checkPartnerNotifications() {
    try {
        const data = await API.getNotificationCount();
        if (data.partnerJoined > 0) {
            showNotification('💕', '有人接受了你的邀请！你们已成功绑定~', async () => {
                // 刷新伴侣信息
                try {
                    const partnerRes = await API.getPartner();
                    state.partner = partnerRes.partner;
                    if (state.partner) {
                        showToast('已绑定成功！💕');
                    }
                } catch (e) {}
            });
            await API.markNotificationsRead('partner_joined');
        }
        if (data.partnerUnbound > 0) {
            showNotification('💔', '对方已解除情侣关系', null);
            await API.markNotificationsRead('partner_unbound');
            state.partner = null;
            // 2秒后自动跳转到角色选择页
            setTimeout(() => {
                showToast('情侣关系已解除');
                switchPage('role-page');
            }, 2000);
        }
    } catch (e) {
        // 静默失败
    }
}

async function updateQuantity(dishId, cartItemId, delta) {
    event.stopPropagation();
    try {
        // 获取当前购物车状态
        const cartRes = await API.getCart();
        const cart = cartRes.cart;
        const item = cart.find(item => item.id === cartItemId);
        if (!item) return;
        
        const newQuantity = item.quantity + delta;
        if (newQuantity <= 0) {
            await API.removeFromCart(dishId);
        } else {
            // 移除旧的，重新添加新数量
            await API.removeFromCart(dishId);
            await API.addToCart({ dishId: dishId, quantity: newQuantity, name: item.name, emoji: item.emoji, category: item.category, time: item.time });
        }
    } catch (e) {
        showToast('操作失败');
        return;
    }
    await renderCart();
}

async function clearCart() {
    try {
        const cartRes = await API.getCart();
        const cart = cartRes.cart;
        if (cart.length === 0) return;
    } catch (e) {
        return;
    }
    if (!confirm('确定要清空购物车吗？')) return;
    try {
        await API.clearCart();
    } catch (e) {
        showToast('清空失败');
        return;
    }
    await renderCart();
    showToast('购物车已清空');
}

async function submitOrder() {
    try {
        const cartRes = await API.getCart();
        const cart = cartRes.cart;
        if (cart.length === 0) {
            showToast('购物车是空的');
            return;
        }
        
        // 确定伴侣用户ID
        const toUserId = state.partner?.id || null;
        
        const orderData = {
            items: cart,
            note: state.orderNote || '',
            toUserId: toUserId
        };
        
        const orderRes = await API.createOrder(orderData);
        lastCreatedOrder = orderRes.order;
        
        // 清空本地状态
        state.orderNote = '';
        try {
            await API.clearCart();
        } catch (e) {
            // 忽略清空购物车错误
        }
        
        // 刷新购物车角标为0
        document.getElementById('cart-badge').textContent = '0';
        document.getElementById('cart-badge').style.display = 'none';
        document.getElementById('cart-count').textContent = '0';
        
        await updateNotificationBadges();
        
        // 飘心庆祝动画
        for (let i = 0; i < 8; i++) {
            setTimeout(() => {
                const emojis = ['❤️', '💕', '💖', '🥰', '💕', '💖'];
                spawnFloatingEmoji(emojis[i % emojis.length]);
            }, i * 150);
        }
        
        showToast('下单成功！💕 已通知Ta');
        
        // 生成小票
        setTimeout(() => {
            showReceipt(orderRes.order);
        }, 800);
        
        // 如果当前是男方角色（切换角色后），直接显示通知
        if (state.currentRole === 'boy') {
            const totalCount = orderRes.order.items.reduce((s, i) => s + i.quantity, 0);
            setTimeout(() => {
                showNotification('🔔', `${state.user ? state.user.nickname : 'Ta'}刚下了${totalCount}道菜的新订单！`, () => {
                    showBoyHome();
                });
            }, 100);
        }
    } catch (e) {
        showToast('下单失败，请重试');
    }
}

async function startCooking(orderId, event) {
    if (event) event.stopPropagation();
    try {
        await API.updateOrderStatus(orderId, 'cooking');
    } catch (e) {
        showToast('操作失败');
        return;
    }
    await renderBoyOrders();
    showToast('开始做菜啦！👨‍🍳');
}

async function completeOrder(orderId, event) {
    if (event) event.stopPropagation();
    try {
        await API.updateOrderStatus(orderId, 'completed');
    } catch (e) {
        showToast('操作失败');
        return;
    }
    await renderBoyOrders();
    await updateNotificationBadges();
    showToast('订单完成！🎉');
    
    // 飘心庆祝
    for (let i = 0; i < 5; i++) {
        setTimeout(() => {
            spawnFloatingEmoji(['🎉', '✨', '❤️', '👏', '🎊'][i]);
        }, i * 200);
    }
    
    // 如果当前是女方角色，直接显示通知
    if (state.currentRole === 'girl') {
        try {
            const ordersRes = await API.getOrders();
            const orders = ordersRes.orders;
            const order = orders.find(o => String(o.id) === String(orderId));
            if (order) {
                if (dishesCache.length === 0) {
                    await getAllDishes();
                }
                const dishNames = order.items.map(item => {
                    const dish = findDish(item.dishId || item.id);
                    return dish ? dish.name : '';
                }).join('、');
                setTimeout(() => {
                    showNotification('🎉', `Ta做好菜啦！${dishNames}，快去享用吧~`, () => {
                        showOrders();
                    });
                }, 100);
            }
        } catch (e) {
            // 静默失败
        }
    }
}

async function showOrderDetail(orderId) {
    try {
        const ordersRes2 = await API.getOrders();
        const orders = ordersRes2.orders;
        const order = orders.find(o => String(o.id) === String(orderId));
        if (!order) return;
        
        if (dishesCache.length === 0) {
            await getAllDishes();
        }
        
        const modal = document.getElementById('order-detail-modal');
        const body = document.getElementById('modal-body');
        
        document.getElementById('modal-title').textContent = '订单详情';
        
        body.innerHTML = `
            <div style="margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <span style="color: var(--text-secondary); font-size: 14px;">订单号：${order.id}</span>
                    <span class="order-status status-${order.status}" style="font-size: 12px;">${getStatusText(order.status)}</span>
                </div>
                <div style="color: var(--text-light); font-size: 13px;">下单时间：${formatTime(order.time)}</div>
            </div>
            <div style="border-top: 1px solid var(--border-color); padding-top: 16px;">
                <div style="font-weight: 600; margin-bottom: 12px;">菜品清单</div>
                ${order.items.map(item => {
                    const dish = findDish(item.dishId || item.id);
                    if (!dish) return '';
                    return `
                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px; padding: 8px; background: var(--bg-color); border-radius: 8px;">
                            <span style="font-size: 32px;">${dish.emoji}</span>
                            <div style="flex: 1;">
                                <div style="font-weight: 500;">${dish.name}</div>
                                <div style="font-size: 12px; color: var(--text-light);">${dish.desc}</div>
                            </div>
                            <span style="font-weight: 600;">x${item.quantity}</span>
                        </div>
                    `;
                }).join('')}
            </div>
            ${order.orderNote ? `
                <div style="margin-top: 16px; padding: 12px; background: #fff5f7; border-radius: 8px; border-left: 3px solid var(--primary-color);">
                    <div style="font-size: 13px; color: var(--primary-color); font-weight: 600; margin-bottom: 6px;">💬 给Ta的话</div>
                    <div style="font-size: 14px; color: var(--text-primary); line-height: 1.5;">${order.orderNote}</div>
                </div>
            ` : ''}
        `;
        
        modal.classList.add('active');
    } catch (e) {
        showToast('加载订单详情失败');
    }
}

function closeModal() {
    document.getElementById('order-detail-modal').classList.remove('active');
}

// ==================== 菜品管理 ====================
async function showDishManage() {
    switchPage('dish-manage-page');
    // 重置搜索
    state.searchTerm = '';
    const searchInput = document.getElementById('dish-search-input');
    if (searchInput) searchInput.value = '';
    document.getElementById('dish-search-clear').style.display = 'none';
    await renderDishManage();
}

async function renderDishManage() {
    const content = document.getElementById('dish-manage-content');
    
    let allDishes = [];
    try {
        allDishes = await getAllDishes();
    } catch (e) {
        showToast('加载菜品失败');
        return;
    }
    
    // 搜索过滤
    if (state.searchTerm) {
        allDishes = allDishes.filter(dish => 
            dish.name.toLowerCase().includes(state.searchTerm) || 
            (dish.desc && dish.desc.toLowerCase().includes(state.searchTerm))
        );
    }
    
    const customDishes = allDishes.filter(d => d.id > 1000 || d.type === 'custom');
    const systemDishes = allDishes.filter(d => d.id <= 1000 && d.type !== 'custom');
    
    const allCategories = await getAllCategories();
    
    let html = '';
    
    // 自定义菜品区域
    html += `
        <div class="dish-manage-section">
            <div class="dish-manage-section-header">
                <h3>我的拿手菜</h3>
                <span class="dish-count">${customDishes.length} 道</span>
            </div>
    `;
    
    if (customDishes.length === 0 && systemDishes.length === 0 && state.searchTerm) {
        html += `
            <div class="empty-dish-manage">
                <div class="emoji">🔍</div>
                <p>没有找到相关菜品</p>
            </div>
        `;
    } else if (customDishes.length === 0) {
        html += `
            <div class="empty-dish-manage" onclick="showAddDishForm()">
                <div class="emoji">🍽️</div>
                <p>还没有添加拿手菜</p>
                <p style="font-size: 14px; margin-top: 8px; color: var(--primary-color);">点击此处添加第一道菜</p>
            </div>
        `;
    } else {
        html += customDishes.map(dish => `
            <div class="dish-manage-item">
                <div class="dish-manage-emoji">${dish.emoji}</div>
                <div class="dish-manage-info">
                    <div class="dish-manage-name">${dish.name}</div>
                    <div class="dish-manage-desc">${dish.desc}</div>
                    <div class="dish-manage-tags">
                        <span class="dish-tag">${allCategories[dish.category] || dish.category}</span>
                        <span class="dish-tag">⏱️ ${dish.time}</span>
                    </div>
                </div>
                <div class="dish-manage-actions">
                    <button class="dish-edit-btn" onclick="showEditDishForm(${dish.id}, event)">✏️</button>
                    <button class="dish-delete-btn" onclick="deleteDish(${dish.id}, event)">🗑️</button>
                </div>
            </div>
        `).join('');
    }
    
    html += '</div>';
    
    // 系统菜品区域
    html += `
        <div class="dish-manage-section">
            <div class="dish-manage-section-header">
                <h3>系统菜品</h3>
                <span class="dish-count">${systemDishes.length} 道</span>
            </div>
            <p style="font-size: 13px; color: var(--text-light); margin-bottom: 12px;">可编辑或删除系统预设菜品</p>
            <div class="system-dish-list">
                ${systemDishes.map(dish => `
                    <div class="dish-manage-item">
                        <div class="dish-manage-emoji">${dish.emoji}</div>
                        <div class="dish-manage-info">
                            <div class="dish-manage-name">${dish.name}</div>
                            <div class="dish-manage-desc">${dish.desc}</div>
                            <div class="dish-manage-tags">
                                <span class="dish-tag">${allCategories[dish.category] || dish.category}</span>
                                <span class="dish-tag">⏱️ ${dish.time}</span>
                            </div>
                        </div>
                        <div class="dish-manage-actions">
                            <button class="dish-edit-btn" onclick="showEditSystemDishForm(${dish.id}, event)">✏️</button>
                            <button class="dish-delete-btn" onclick="deleteSystemDish(${dish.id}, event)">🗑️</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    content.innerHTML = html;
}

async function showAddDishForm() {
    const modal = document.getElementById('order-detail-modal');
    const body = document.getElementById('modal-body');
    
    document.getElementById('modal-title').textContent = '新增菜品';
    
    // 获取自定义分类
    let customCatButtons = '';
    try {
        const catsRes = await API.getCategories();
        customCatButtons = catsRes.categories
            .filter(cat => !['home', 'soup', 'dessert', 'noodle'].includes(cat.key))
            .map(cat => `
                <button class="cat-option" data-cat="${cat.key}" onclick="selectCategory(this)">${cat.icon} ${cat.label}</button>
            `).join('');
    } catch (e) {
        // 无自定义分类
    }
    
    body.innerHTML = `
        <div class="dish-form">
            <div class="form-group">
                <label>菜品图标</label>
                <div class="emoji-picker" id="emoji-picker">
                    <button class="emoji-option selected" data-emoji="🥘" onclick="selectEmoji(this)">🥘</button>
                    <button class="emoji-option" data-emoji="🍳" onclick="selectEmoji(this)">🍳</button>
                    <button class="emoji-option" data-emoji="🍗" onclick="selectEmoji(this)">🍗</button>
                    <button class="emoji-option" data-emoji="🍖" onclick="selectEmoji(this)">🍖</button>
                    <button class="emoji-option" data-emoji="🐟" onclick="selectEmoji(this)">🐟</button>
                    <button class="emoji-option" data-emoji="🥩" onclick="selectEmoji(this)">🥩</button>
                    <button class="emoji-option" data-emoji="🍤" onclick="selectEmoji(this)">🍤</button>
                    <button class="emoji-option" data-emoji="🥬" onclick="selectEmoji(this)">🥬</button>
                    <button class="emoji-option" data-emoji="🫑" onclick="selectEmoji(this)">🫑</button>
                    <button class="emoji-option" data-emoji="🍅" onclick="selectEmoji(this)">🍅</button>
                    <button class="emoji-option" data-emoji="🥚" onclick="selectEmoji(this)">🥚</button>
                    <button class="emoji-option" data-emoji="🍜" onclick="selectEmoji(this)">🍜</button>
                    <button class="emoji-option" data-emoji="🍝" onclick="selectEmoji(this)">🍝</button>
                    <button class="emoji-option" data-emoji="🥟" onclick="selectEmoji(this)">🥟</button>
                    <button class="emoji-option" data-emoji="🍲" onclick="selectEmoji(this)">🍲</button>
                    <button class="emoji-option" data-emoji="🥣" onclick="selectEmoji(this)">🥣</button>
                    <button class="emoji-option" data-emoji="🌽" onclick="selectEmoji(this)">🌽</button>
                    <button class="emoji-option" data-emoji="🥭" onclick="selectEmoji(this)">🥭</button>
                    <button class="emoji-option" data-emoji="🍮" onclick="selectEmoji(this)">🍮</button>
                    <button class="emoji-option" data-emoji="🍡" onclick="selectEmoji(this)">🍡</button>
                </div>
            </div>
            <div class="form-group">
                <label>菜品名称</label>
                <input type="text" id="dish-name-input" placeholder="如：红烧排骨" maxlength="20">
            </div>
            <div class="form-group">
                <label>菜品描述</label>
                <input type="text" id="dish-desc-input" placeholder="如：肥而不腻，入口即化" maxlength="30">
            </div>
            <div class="form-group">
                <label>菜品分类</label>
                <div class="category-selector" id="category-selector">
                    <button class="cat-option selected" data-cat="home" onclick="selectCategory(this)">家常菜</button>
                    <button class="cat-option" data-cat="soup" onclick="selectCategory(this)">汤羹</button>
                    <button class="cat-option" data-cat="dessert" onclick="selectCategory(this)">甜点</button>
                    <button class="cat-option" data-cat="noodle" onclick="selectCategory(this)">面食</button>
                    ${customCatButtons}
                    <button class="cat-option add-cat-btn" onclick="showAddCategoryForm()">➕ 新增分类</button>
                </div>
            </div>
            <div class="form-group">
                <label>制作时间</label>
                <div class="time-selector" id="time-selector">
                    <button class="time-option" data-time="10分钟" onclick="selectTime(this)">10分钟</button>
                    <button class="time-option" data-time="15分钟" onclick="selectTime(this)">15分钟</button>
                    <button class="time-option" data-time="20分钟" onclick="selectTime(this)">20分钟</button>
                    <button class="time-option selected" data-time="30分钟" onclick="selectTime(this)">30分钟</button>
                    <button class="time-option" data-time="45分钟" onclick="selectTime(this)">45分钟</button>
                    <button class="time-option" data-time="60分钟" onclick="selectTime(this)">60分钟</button>
                </div>
            </div>
            <div class="form-actions">
                <button class="form-cancel-btn" onclick="closeModal()">取消</button>
                <button class="form-save-btn" onclick="saveNewDish()">保存菜品</button>
            </div>
        </div>
    `;
    
    modal.classList.add('active');
}

async function showEditDishForm(dishId, event) {
    if (event) event.stopPropagation();
    
    // 确保 dishesCache 已加载
    if (dishesCache.length === 0) {
        await getAllDishes();
    }
    const dish = findDish(dishId);
    if (!dish) return;
    
    window._editDishId = dishId;
    
    const modal = document.getElementById('order-detail-modal');
    const body = document.getElementById('modal-body');
    
    document.getElementById('modal-title').textContent = '编辑菜品';
    
    const allCategories = await getAllCategories();
    
    body.innerHTML = `
        <div class="dish-form">
            <div class="form-group">
                <label>菜品图标</label>
                <div class="emoji-picker" id="emoji-picker">
                    ${['🥘','🍳','🍗','🍖','🐟','🥩','🍤','🥬','🫑','🍅','🥚','🍜','🍝','🥟','🍲','🥣','🌽','🥭','🍮','🍡'].map(e => `
                        <button class="emoji-option ${e === dish.emoji ? 'selected' : ''}" data-emoji="${e}" onclick="selectEmoji(this)">${e}</button>
                    `).join('')}
                </div>
            </div>
            <div class="form-group">
                <label>菜品名称</label>
                <input type="text" id="dish-name-input" value="${dish.name}" maxlength="20">
            </div>
            <div class="form-group">
                <label>菜品描述</label>
                <input type="text" id="dish-desc-input" value="${dish.desc}" maxlength="30">
            </div>
            <div class="form-group">
                <label>菜品分类</label>
                <div class="category-selector" id="category-selector">
                    ${Object.entries(allCategories).map(([key, name]) => `
                        <button class="cat-option ${key === dish.category ? 'selected' : ''}" data-cat="${key}" onclick="selectCategory(this)">${name}</button>
                    `).join('')}
                    <button class="cat-option add-cat-btn" onclick="showAddCategoryForm('editCustom')">➕ 新增分类</button>
                </div>
            </div>
            <div class="form-group">
                <label>制作时间</label>
                <div class="time-selector" id="time-selector">
                    ${['10分钟','15分钟','20分钟','30分钟','45分钟','60分钟'].map(t => `
                        <button class="time-option ${t === dish.time ? 'selected' : ''}" data-time="${t}" onclick="selectTime(this)">${t}</button>
                    `).join('')}
                </div>
            </div>
            <div class="form-actions">
                <button class="form-cancel-btn" onclick="closeModal()">取消</button>
                <button class="form-save-btn" onclick="updateDish(${dishId})">保存修改</button>
            </div>
        </div>
    `;
    
    modal.classList.add('active');
}

function selectEmoji(btn) {
    document.querySelectorAll('.emoji-option').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
}

function selectCategory(btn) {
    document.querySelectorAll('.cat-option').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
}

function selectTime(btn) {
    document.querySelectorAll('.time-option').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
}

// 显示新增分类弹窗
function showAddCategoryForm(returnForm) {
    // 保存来源，新增完分类后可以返回
    window._categoryFormReturn = returnForm || 'add';
    
    const modal = document.getElementById('order-detail-modal');
    const body = document.getElementById('modal-body');
    
    document.getElementById('modal-title').textContent = '新增菜类';
    
    const catEmojis = ['🥗','🫕','🍢','🥙','🌮','🍣','🥪','🧆','🥘','🥫','🫔','🫙','🍴','🥂','🍾','🍵','🧋','🫖','🍶','🧃'];
    
    body.innerHTML = `
        <div class="dish-form">
            <div class="form-group">
                <label>分类图标</label>
                <div class="emoji-picker" id="cat-emoji-picker">
                    ${catEmojis.map(e => `
                        <button class="emoji-option" data-emoji="${e}" onclick="selectCatEmoji(this)">${e}</button>
                    `).join('')}
                </div>
            </div>
            <div class="form-group">
                <label>分类名称</label>
                <input type="text" id="cat-name-input" placeholder="如：烧烤、饮品、早餐" maxlength="8">
            </div>
            <div class="form-actions">
                <button class="form-cancel-btn" onclick="restoreDishForm()">取消</button>
                <button class="form-save-btn" onclick="saveNewCategory()">保存分类</button>
            </div>
        </div>
    `;
    
    modal.classList.add('active');
}

// 选中分类图标
function selectCatEmoji(btn) {
    document.querySelectorAll('#cat-emoji-picker .emoji-option').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
}

// 保存新增分类
async function saveNewCategory() {
    const name = document.getElementById('cat-name-input').value.trim();
    const icon = document.querySelector('#cat-emoji-picker .emoji-option.selected')?.dataset.emoji || '🍽️';
    
    if (!name) {
        showToast('请输入分类名称');
        return;
    }
    
    // 生成唯一 key
    const key = 'custom_' + Date.now();
    
    try {
        await API.addCategory({ catKey: key, icon: icon, label: name });
    } catch (e) {
        showToast('添加分类失败');
        return;
    }
    
    showToast('分类添加成功！🎉');
    
    // 返回上一个表单
    restoreDishForm();
}

// 从新增分类弹窗返回上一个表单
function restoreDishForm() {
    if (window._categoryFormReturn === 'editCustom' && window._editDishId) {
        showEditDishForm(window._editDishId, null);
    } else if (window._categoryFormReturn === 'editSystem' && window._editSystemDishId) {
        showEditSystemDishForm(window._editSystemDishId, null);
    } else {
        showAddDishForm();
    }
}

async function saveNewDish() {
    const name = document.getElementById('dish-name-input').value.trim();
    const desc = document.getElementById('dish-desc-input').value.trim();
    const emoji = document.querySelector('.emoji-option.selected')?.dataset.emoji || '🥘';
    const category = document.querySelector('.cat-option.selected')?.dataset.cat || 'home';
    const time = document.querySelector('.time-option.selected')?.dataset.time || '30分钟';
    
    if (!name) {
        showToast('请输入菜品名称');
        return;
    }
    if (!desc) {
        showToast('请输入菜品描述');
        return;
    }
    
    try {
        await API.addDish({ name, emoji, category, desc, time });
    } catch (e) {
        showToast('添加菜品失败');
        return;
    }
    closeModal();
    await renderDishManage();
    showToast('菜品添加成功！🎉');
}

async function updateDish(dishId) {
    const name = document.getElementById('dish-name-input').value.trim();
    const desc = document.getElementById('dish-desc-input').value.trim();
    const emoji = document.querySelector('.emoji-option.selected')?.dataset.emoji || '🥘';
    const category = document.querySelector('.cat-option.selected')?.dataset.cat || 'home';
    const time = document.querySelector('.time-option.selected')?.dataset.time || '30分钟';
    
    if (!name) {
        showToast('请输入菜品名称');
        return;
    }
    if (!desc) {
        showToast('请输入菜品描述');
        return;
    }
    
    try {
        await API.updateDish(dishId, { name, emoji, category, desc, time });
    } catch (e) {
        showToast('修改菜品失败');
        return;
    }
    closeModal();
    await renderDishManage();
    showToast('菜品修改成功！✏️');
}

async function deleteDish(dishId, event) {
    if (event) event.stopPropagation();
    
    if (dishesCache.length === 0) {
        await getAllDishes();
    }
    const dish = findDish(dishId);
    if (!dish) return;
    
    if (!confirm(`确定要删除「${dish.name}」吗？`)) return;
    
    try {
        await API.deleteDish(dishId);
    } catch (e) {
        showToast('删除失败');
        return;
    }
    await renderDishManage();
    showToast('菜品已删除');
}

async function showEditSystemDishForm(dishId, event) {
    if (event) event.stopPropagation();
    
    if (dishesCache.length === 0) {
        await getAllDishes();
    }
    const dish = findDish(dishId);
    if (!dish) return;
    
    window._editSystemDishId = dishId;
    
    const modal = document.getElementById('order-detail-modal');
    const body = document.getElementById('modal-body');
    
    document.getElementById('modal-title').textContent = '编辑菜品';
    
    const allCategories = await getAllCategories();
    
    body.innerHTML = `
        <div class="dish-form">
            <div class="form-group">
                <label>菜品图标</label>
                <div class="emoji-picker" id="emoji-picker">
                    ${['🥘','🍳','🍗','🍖','🐟','🥩','🍤','🥬','🫑','🍅','🥚','🍜','🍝','🥟','🍲','🥣','🌽','🥭','🍮','🍡'].map(e => `
                        <button class="emoji-option ${e === dish.emoji ? 'selected' : ''}" data-emoji="${e}" onclick="selectEmoji(this)">${e}</button>
                    `).join('')}
                </div>
            </div>
            <div class="form-group">
                <label>菜品名称</label>
                <input type="text" id="dish-name-input" value="${dish.name}" maxlength="20">
            </div>
            <div class="form-group">
                <label>菜品描述</label>
                <input type="text" id="dish-desc-input" value="${dish.desc}" maxlength="30">
            </div>
            <div class="form-group">
                <label>菜品分类</label>
                <div class="category-selector" id="category-selector">
                    ${Object.entries(allCategories).map(([key, name]) => `
                        <button class="cat-option ${key === dish.category ? 'selected' : ''}" data-cat="${key}" onclick="selectCategory(this)">${name}</button>
                    `).join('')}
                    <button class="cat-option add-cat-btn" onclick="showAddCategoryForm('editSystem')">➕ 新增分类</button>
                </div>
            </div>
            <div class="form-group">
                <label>制作时间</label>
                <div class="time-selector" id="time-selector">
                    ${['10分钟','15分钟','20分钟','30分钟','45分钟','60分钟'].map(t => `
                        <button class="time-option ${t === dish.time ? 'selected' : ''}" data-time="${t}" onclick="selectTime(this)">${t}</button>
                    `).join('')}
                </div>
            </div>
            <div class="form-actions">
                <button class="form-cancel-btn" onclick="closeModal()">取消</button>
                <button class="form-save-btn" onclick="updateSystemDish(${dishId})">保存修改</button>
            </div>
        </div>
    `;
    
    modal.classList.add('active');
}

async function updateSystemDish(dishId) {
    const name = document.getElementById('dish-name-input').value.trim();
    const desc = document.getElementById('dish-desc-input').value.trim();
    const emoji = document.querySelector('.emoji-option.selected')?.dataset.emoji || '🥘';
    const category = document.querySelector('.cat-option.selected')?.dataset.cat || 'home';
    const time = document.querySelector('.time-option.selected')?.dataset.time || '30分钟';
    
    if (!name) {
        showToast('请输入菜品名称');
        return;
    }
    if (!desc) {
        showToast('请输入菜品描述');
        return;
    }
    
    try {
        await API.updateSystemDish(dishId, { name, emoji, category, desc, time });
    } catch (e) {
        showToast('修改菜品失败');
        return;
    }
    closeModal();
    await renderDishManage();
    showToast('菜品修改成功！✏️');
}

async function deleteSystemDish(dishId, event) {
    if (event) event.stopPropagation();
    
    if (dishesCache.length === 0) {
        await getAllDishes();
    }
    const dish = findDish(dishId);
    if (!dish) return;
    
    if (!confirm(`确定要删除「${dish.name}」吗？删除后不可恢复。`)) return;
    
    try {
        await API.deleteDish(dishId);
    } catch (e) {
        showToast('删除失败');
        return;
    }
    await renderDishManage();
    showToast('菜品已删除');
}

// ==================== 留言备注功能 ====================
function showNoteModal() {
    const input = document.getElementById('order-note-input');
    input.value = state.orderNote || '';
    document.getElementById('note-count').textContent = (state.orderNote || '').length;
    document.getElementById('note-modal').classList.add('active');
    setTimeout(() => input.focus(), 100);
}

function closeNoteModal() {
    document.getElementById('note-modal').classList.remove('active');
}

function appendNote(text) {
    const input = document.getElementById('order-note-input');
    const current = input.value.trim();
    if (current) {
        input.value = current + ' ' + text;
    } else {
        input.value = text;
    }
    updateNoteCount();
}

function updateNoteCount() {
    const input = document.getElementById('order-note-input');
    document.getElementById('note-count').textContent = input.value.length;
}

async function saveNote() {
    const note = document.getElementById('order-note-input').value.trim();
    state.orderNote = note;
    closeNoteModal();
    await renderCart();
    showToast(note ? '留言已保存 💬' : '留言已清空');
}

// ==================== 点单小票功能 ====================
function showReceipt(order) {
    const body = document.getElementById('receipt-body');
    const date = new Date(order.createdAt || order.time);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const timeStr = `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
    const dayOfWeek = ['周日','周一','周二','周三','周四','周五','周六'][date.getDay()];
    
    const totalCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
    
    const userNickname = state.user ? state.user.nickname : '亲爱的';
    const userAvatar = state.user ? state.user.avatar : '😊';
    const partnerNickname = state.partner ? state.partner.nickname : '大厨';
    const partnerAvatar = state.partner ? state.partner.avatar : '👨‍🍳';
    
    body.innerHTML = `
        <div class="receipt-card" id="receipt-card">
            <div class="receipt-header">
                <div class="receipt-logo">🍳</div>
                <h2>爱心厨房</h2>
                <p>今日点单小票</p>
                <div class="receipt-divider">- - - - - - - - - - - - -</div>
            </div>
            
            <div class="receipt-info">
                <div class="receipt-info-row">
                    <span>日期</span>
                    <span>${dateStr} ${dayOfWeek}</span>
                </div>
                <div class="receipt-info-row">
                    <span>时间</span>
                    <span>${timeStr}</span>
                </div>
                <div class="receipt-info-row">
                    <span>单号</span>
                    <span>${String(order.id).slice(-8)}</span>
                </div>
                <div class="receipt-info-row">
                    <span>点单人</span>
                    <span>${userAvatar} ${userNickname}</span>
                </div>
                <div class="receipt-info-row">
                    <span>做菜人</span>
                    <span>${partnerAvatar} ${partnerNickname}</span>
                </div>
            </div>
            
            <div class="receipt-divider">- - - - - - - - - - - - -</div>
            
            <div class="receipt-items">
                ${order.items.map((item, idx) => {
                    const dish = findDish(item.dishId || item.id);
                    if (!dish) return '';
                    return `
                        <div class="receipt-item">
                            <span class="receipt-item-num">${String(idx+1).padStart(2,'0')}</span>
                            <span class="receipt-item-emoji">${dish.emoji}</span>
                            <span class="receipt-item-name">${dish.name}</span>
                            <span class="receipt-item-qty">x${item.quantity}</span>
                        </div>
                    `;
                }).join('')}
            </div>
            
            <div class="receipt-divider">- - - - - - - - - - - - -</div>
            
            <div class="receipt-summary">
                <div class="receipt-total">
                    <span>共计</span>
                    <span>${totalCount} 道菜</span>
                </div>
            </div>
            
            ${order.note ? `
                <div class="receipt-note">
                    <div class="receipt-note-label">💬 给Ta的话：</div>
                    <div class="receipt-note-content">${order.note}</div>
                </div>
                <div class="receipt-divider">- - - - - - - - - - - - -</div>
            ` : ''}
            
            <div class="receipt-footer">
                <div class="receipt-hearts">💕 ❤️ 💕</div>
                <p>用心做好每一道菜~</p>
                <p class="receipt-brand">爱心厨房 · 记录我们的每一餐</p>
            </div>
        </div>
        
        <div class="receipt-actions">
            <button class="receipt-action-btn save" onclick="saveReceiptImage()">📥 保存图片</button>
            <button class="receipt-action-btn share" onclick="shareReceipt()">📤 分享</button>
            <button class="receipt-action-btn view" onclick="closeReceiptModal(); showOrders();">📋 查看订单</button>
        </div>
    `;
    
    document.getElementById('receipt-modal').classList.add('active');
}

function closeReceiptModal() {
    document.getElementById('receipt-modal').classList.remove('active');
    // 关闭小票后跳转到订单页
    showOrders();
}

function saveReceiptImage() {
    const card = document.getElementById('receipt-card');
    if (!card) return;
    
    // 使用 lastCreatedOrder 而不是 state.orders
    const order = lastCreatedOrder;
    if (!order) return;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const width = 360;
    const lineHeight = 24;
    
    // 计算高度
    let height = 400;
    height += order.items.length * lineHeight;
    if (order.note) height += 80;
    
    canvas.width = width;
    canvas.height = height;
    
    // 绘制背景
    ctx.fillStyle = '#fff5f7';
    ctx.fillRect(0, 0, width, height);
    
    // 绘制内容
    ctx.fillStyle = '#ff6b8a';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🍳 爱心厨房', width/2, 40);
    
    ctx.fillStyle = '#666';
    ctx.font = '14px sans-serif';
    ctx.fillText('今日点单小票', width/2, 64);
    
    const date = new Date(order.createdAt || order.time);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
    
    ctx.textAlign = 'left';
    ctx.fillStyle = '#999';
    ctx.font = '13px sans-serif';
    let y = 100;
    ctx.fillText(`日期：${dateStr}`, 30, y); y += lineHeight;
    ctx.fillText(`单号：${order.orderNo}`, 30, y); y += lineHeight;
    ctx.fillText(`点单人：${state.user ? state.user.nickname : '亲爱的'}`, 30, y); y += lineHeight + 10;
    
    // 分割线
    ctx.fillStyle = '#ffe0e6';
    ctx.fillRect(30, y, width - 60, 1); y += lineHeight;
    
    // 菜品列表
    ctx.fillStyle = '#333';
    ctx.font = '14px sans-serif';
    order.items.forEach((item, idx) => {
        const dish = findDish(item.dishId || item.id);
        if (!dish) return;
        ctx.fillText(`${idx+1}. ${dish.emoji} ${dish.name}`, 30, y);
        ctx.textAlign = 'right';
        ctx.fillText(`x${item.quantity}`, width - 30, y);
        ctx.textAlign = 'left';
        y += lineHeight;
    });
    
    y += 10;
    ctx.fillStyle = '#ffe0e6';
    ctx.fillRect(30, y, width - 60, 1); y += lineHeight;
    
    const totalCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
    ctx.fillStyle = '#ff6b8a';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`共计 ${totalCount} 道菜`, 30, y); y += lineHeight + 10;
    
    if (order.note) {
        ctx.fillStyle = '#666';
        ctx.font = '13px sans-serif';
        ctx.fillText(`💬 ${order.note}`, 30, y); y += lineHeight + 10;
    }
    
    y += 20;
    ctx.fillStyle = '#ff6b8a';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('💕 ❤️ 💕', width/2, y); y += lineHeight;
    ctx.fillStyle = '#999';
    ctx.font = '12px sans-serif';
    ctx.fillText('爱心厨房 · 记录我们的每一餐', width/2, y);
    
    // 下载图片
    const link = document.createElement('a');
    link.download = `爱心厨房_点单小票_${dateStr.split(' ')[0].replace(/-/g,'')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    
    showToast('小票已保存到下载文件夹 📥');
}

function shareReceipt() {
    const order = lastCreatedOrder;
    if (!order) return;
    
    const date = new Date(order.createdAt || order.time);
    const dateStr = `${date.getMonth()+1}月${date.getDate()}日`;
    
    let shareText = `🍳 爱心厨房 - 今日点单小票\n`;
    shareText += `📅 ${dateStr}\n`;
    shareText += `────────\n`;
    
    order.items.forEach((item, idx) => {
        const dish = findDish(item.dishId || item.id);
        if (!dish) return;
        shareText += `${dish.emoji} ${dish.name} x${item.quantity}\n`;
    });
    
    const totalCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
    shareText += `────────\n`;
    shareText += `共 ${totalCount} 道菜\n`;
    
    if (order.note) {
        shareText += `💬 ${order.note}\n`;
    }
    
    shareText += `────────\n`;
    shareText += `💕 用心做好每一道菜~`;
    
    // 尝试使用Web Share API
    if (navigator.share) {
        navigator.share({
            title: '爱心厨房 - 今日点单小票',
            text: shareText
        }).then(() => {
            showToast('分享成功！');
        }).catch(() => {
            copyShareText(shareText);
        });
    } else {
        copyShareText(shareText);
    }
}

function copyShareText(text) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('小票内容已复制，可粘贴分享 📋');
        });
    } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('小票内容已复制，可粘贴分享 📋');
    }
}

// ==================== 初始化 ====================
async function init() {
    // 将通知横幅移到 body 下，避免被 #app overflow:hidden 影响
    const banner = document.getElementById('notification-banner');
    if (banner && banner.parentElement !== document.body) {
        document.body.appendChild(banner);
    }
    
    // 模拟加载动画后，检查登录态
    setTimeout(async () => {
        initLoginPage();
        
        // 检查 authToken
        if (authToken) {
            try {
                const userRes = await API.getUser();
                state.user = userRes.user;
                
                // 加载伴侣信息
                try {
                    const partnerRes = await API.getPartner();
                    state.partner = partnerRes.partner;
                } catch (e) {
                    state.partner = null;
                }
                
                // 如果已绑定伴侣，直接进入角色选择
                switchPage('role-page');
            } catch (e) {
                // token 无效，清除并显示登录页
                setToken(null);
                state.user = null;
                switchPage('login-page');
            }
        } else {
            switchPage('login-page');
        }
    }, 1500);
}

// ==================== 登录功能 ====================
const avatarList = ['😊', '🥰', '😘', '😜', '🤗', '😁', '🥳', '😎', '🤩', '😇',
    '🐱', '🐶', '🐰', '🐻', '🐼', '🦊', '🐸', '🐵', '🦁', '🐯',
    '🌸', '🌺', '🌻', '🌈', '⭐', '🍎', '🍓', '🧁', '🍩', '🍪'];
const defaultNicknames = ['小可爱', '吃货', '美食家', '小吃货', '大厨', '宝贝'];

// 当前登录页面选择的头像和昵称
let loginSelectedAvatar = '😊';
let loginSelectedNickname = '';

// 初始化头像选择器
function initAvatarPicker(prefix) {
    const grid = document.getElementById(prefix + '-avatar-grid');
    if (!grid) return;
    const currentAvatar = (prefix === 'login') ? loginSelectedAvatar : (state.user ? state.user.avatar : '😊');
    grid.innerHTML = avatarList.map(emoji => `
        <div class="avatar-picker-item ${emoji === currentAvatar ? 'selected' : ''}" 
             onclick="selectAvatar('${prefix}', '${emoji}', this)">${emoji}</div>
    `).join('');
}

// 切换头像选择器显示
function toggleAvatarPicker(prefix) {
    const picker = document.getElementById(prefix + '-avatar-picker');
    if (!picker) return;
    if (picker.style.display === 'none') {
        initAvatarPicker(prefix);
        picker.style.display = 'block';
    } else {
        picker.style.display = 'none';
    }
}

// 选择头像
async function selectAvatar(prefix, emoji, el) {
    document.querySelectorAll('#' + prefix + '-avatar-grid .avatar-picker-item').forEach(item => {
        item.classList.remove('selected');
    });
    el.classList.add('selected');
    
    const preview = document.getElementById(prefix + '-avatar-preview');
    if (preview) preview.textContent = emoji;
    
    if (prefix === 'login') {
        loginSelectedAvatar = emoji;
    } else if (state.user) {
        state.user.avatar = emoji;
        try {
            await API.updateUser({ avatar: emoji });
        } catch (e) {
            showToast('更新头像失败');
        }
        // 更新设置页面的头像显示
        await renderSettings();
    }
    // 隐藏选择器
    const picker = document.getElementById(prefix + '-avatar-picker');
    if (picker) picker.style.display = 'none';
}

// 监听昵称输入（登录页面）
function onNicknameInput(value) {
    loginSelectedNickname = value.trim();
}

// 登录页面初始化（恢复已登录用户的信息）
function initLoginPage() {
    if (state.user) {
        loginSelectedAvatar = state.user.avatar;
        const preview = document.getElementById('login-avatar-preview');
        if (preview) preview.textContent = state.user.avatar;
        const nickInput = document.getElementById('nickname-input');
        if (nickInput) {
            nickInput.value = state.user.nickname;
            loginSelectedNickname = state.user.nickname;
        }
    }
}

// 设置页面修改昵称
function showEditNicknameForm() {
    if (!state.user) return;
    const modal = document.getElementById('order-detail-modal');
    const body = document.getElementById('modal-body');
    
    document.getElementById('modal-title').textContent = '修改昵称';
    
    body.innerHTML = `
        <div class="dish-form">
            <div class="form-group">
                <label>当前昵称</label>
                <div style="text-align:center;font-size:20px;padding:8px;">${state.user.avatar} ${state.user.nickname}</div>
            </div>
            <div class="form-group">
                <label>新昵称</label>
                <input type="text" id="edit-nickname-input" placeholder="输入新昵称" maxlength="10" value="${state.user.nickname}">
            </div>
            <div class="form-actions">
                <button class="form-cancel-btn" onclick="closeModal()">取消</button>
                <button class="form-save-btn" onclick="saveNickname()">保存</button>
            </div>
        </div>
    `;
    
    modal.classList.add('active');
}

async function saveNickname() {
    const newNick = document.getElementById('edit-nickname-input').value.trim();
    if (!newNick) {
        showToast('昵称不能为空');
        return;
    }
    try {
        await API.updateUser({ nickname: newNick });
    } catch (e) {
        showToast('修改昵称失败');
        return;
    }
    state.user.nickname = newNick;
    closeModal();
    await renderSettings();
    showToast('昵称修改成功！✨');
}

function sendCode() {
    const phone = document.getElementById('phone-input').value.trim();
    if (phone.length !== 11) {
        showToast('请输入正确的手机号');
        return;
    }
    
    const btn = document.getElementById('code-btn');
    btn.disabled = true;
    btn.textContent = '发送中...';
    
    // 模拟发送验证码
    setTimeout(() => {
        showToast('验证码已发送');
        let countdown = 60;
        btn.textContent = `${countdown}s`;
        const timer = setInterval(() => {
            countdown--;
            btn.textContent = `${countdown}s`;
            if (countdown <= 0) {
                clearInterval(timer);
                btn.disabled = false;
                btn.textContent = '获取验证码';
            }
        }, 1000);
    }, 1000);
}

async function doLogin() {
    const phone = document.getElementById('phone-input').value.trim();
    const code = document.getElementById('code-input').value.trim();
    
    if (phone.length !== 11) {
        showToast('请输入正确的手机号');
        return;
    }
    if (!code || code.length < 4) {
        showToast('请输入验证码');
        return;
    }
    
    const nickname = loginSelectedNickname || defaultNicknames[Math.floor(Math.random() * defaultNicknames.length)];
    
    try {
        const res = await API.login(phone, nickname, loginSelectedAvatar, 'phone');
        setToken(res.token);
        state.user = res.user;
    } catch (e) {
        showToast('登录失败，请重试');
        return;
    }
    
    // 加载伴侣信息
    try {
        const partnerRes = await API.getPartner();
        state.partner = partnerRes.partner;
    } catch (e) {
        state.partner = null;
    }
    
    showToast('登录成功！');
    
    // 登录后检查是否已绑定情侣
    setTimeout(() => {
        if (state.partner) {
            switchPage('role-page');
        } else {
            switchPage('bind-page');
            renderBindPage();
        }
    }, 500);
}

async function wechatLogin() {
    const nickname = loginSelectedNickname || defaultNicknames[Math.floor(Math.random() * defaultNicknames.length)];
    
    try {
        const res = await API.login('', nickname, loginSelectedAvatar, 'wechat');
        setToken(res.token);
        state.user = res.user;
    } catch (e) {
        showToast('微信登录失败，请重试');
        return;
    }
    
    // 加载伴侣信息
    try {
        const partnerRes = await API.getPartner();
        state.partner = partnerRes.partner;
    } catch (e) {
        state.partner = null;
    }
    
    showToast('微信登录成功！');
    
    setTimeout(() => {
        if (state.partner) {
            switchPage('role-page');
        } else {
            switchPage('bind-page');
            renderBindPage();
        }
    }, 500);
}

// ==================== 情侣绑定功能 ====================
function renderBindPage() {
    const infoArea = document.getElementById('bind-user-info');
    if (state.user) {
        const loginLabel = state.user.loginType === 'wechat' ? '微信' : (state.user.phone ? state.user.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '--');
        infoArea.innerHTML = `
            <div class="bind-current-user">
                <span class="bind-avatar">${state.user.avatar}</span>
                <div>
                    <div class="bind-nickname">${state.user.nickname}</div>
                    <div class="bind-phone">${loginLabel}</div>
                </div>
            </div>
        `;
    }
    
    // 启动轮询：每3秒检查伴侣是否已加入
    if (state.bindPollTimer) clearInterval(state.bindPollTimer);
    state.bindPollTimer = setInterval(async () => {
        try {
            const data = await API.getNotificationCount();
            if (data.partnerJoined > 0) {
                // 伴侣已加入！停止轮询
                clearInterval(state.bindPollTimer);
                state.bindPollTimer = null;
                await API.markNotificationsRead('partner_joined');
                
                // 关闭所有弹窗
                document.getElementById('invite-modal').classList.remove('active');
                document.getElementById('join-modal').classList.remove('active');
                
                // 加载伴侣信息
                try {
                    const partnerRes = await API.getPartner();
                    state.partner = partnerRes.partner;
                } catch (e) {}
                
                showToast('伴侣已绑定成功！💕');
                setTimeout(() => switchPage('role-page'), 800);
            }
        } catch (e) {
            // 静默失败，继续轮询
        }
    }, 3000);
}

function generateInviteCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

async function createInvite() {
    try {
        const res = await API.createInvitation();
        const code = res.code;
        state.myInviteCode = code;
        
        document.getElementById('invite-code-text').textContent = code;
        
        // 生成简易二维码区域
        const qrcodeArea = document.getElementById('qrcode-area');
        qrcodeArea.innerHTML = `
            <div class="fake-qrcode">
                <div class="qr-corner tl"></div>
                <div class="qr-corner tr"></div>
                <div class="qr-corner bl"></div>
                <div class="qr-corner br"></div>
                <div class="qr-center">❤️</div>
                <div class="qr-text">${code}</div>
            </div>
        `;
        
        document.getElementById('invite-modal').classList.add('active');
    } catch (e) {
        showToast('创建邀请码失败，请重试');
    }
}

function copyInviteCode() {
    const code = document.getElementById('invite-code-text').textContent;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(code).then(() => {
            showToast('邀请码已复制');
        });
    } else {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('邀请码已复制');
    }
}

function closeInviteModal() {
    document.getElementById('invite-modal').classList.remove('active');
}

function showJoinInvite() {
    document.getElementById('invite-code-input').value = '';
    document.getElementById('join-modal').classList.add('active');
}

function closeJoinModal() {
    document.getElementById('join-modal').classList.remove('active');
}

async function joinInvite() {
    const code = document.getElementById('invite-code-input').value.trim().toUpperCase();
    
    if (!code || code.length !== 6) {
        showToast('请输入6位邀请码');
        return;
    }
    
    try {
        const res = await API.joinInvitation(code);
        state.partner = res.partner;
        state.partner.bindTime = new Date().toISOString();
        
        closeJoinModal();
        showToast('绑定成功！💕');
        
        setTimeout(() => {
            switchPage('role-page');
        }, 1000);
    } catch (e) {
        showToast(e.message || '邀请码无效，请检查');
    }
}

function skipBind() {
    switchPage('role-page');
}

// ==================== 设置页面 ====================
async function showSettings() {
    switchPage('settings-page');
    // 刷新用户信息
    try {
        const userRes = await API.getUser();
        state.user = userRes.user;
    } catch (e) {
        // 保持现有用户信息
    }
    await renderSettings();
}

function goBackFromSettings() {
    if (state.currentRole === 'girl') {
        showGirlHome();
    } else if (state.currentRole === 'boy') {
        showBoyHome();
    } else {
        switchPage('role-page');
    }
}

async function renderSettings() {
    // 用户信息卡片
    const userCard = document.getElementById('settings-user-card');
    if (state.user) {
        const loginLabel = state.user.loginType === 'wechat' ? '微信登录' : (state.user.phone || '手机登录');
        userCard.innerHTML = `
            <div class="settings-user-avatar" onclick="toggleAvatarPicker('settings')">${state.user.avatar}</div>
            <div class="settings-user-info">
                <div class="settings-user-name" id="settings-nickname-display">${state.user.nickname}</div>
                <div class="settings-user-id">${loginLabel}</div>
            </div>
            <div class="settings-edit-btn" onclick="showEditNicknameForm()">✏️</div>
        `;
    } else {
        userCard.innerHTML = `
            <div class="settings-user-avatar">😊</div>
            <div class="settings-user-info">
                <div class="settings-user-name">未登录</div>
                <div class="settings-user-id">请先登录</div>
            </div>
        `;
    }
    
    // 伴侣信息
    const partnerArea = document.getElementById('partner-info-area');
    const unbindArea = document.getElementById('unbind-area');
    
    if (state.partner) {
        const bindDate = state.partner.bindTime ? formatTime(state.partner.bindTime) : '--';
        partnerArea.innerHTML = `
            <div class="partner-card">
                <span class="partner-avatar">${state.partner.avatar}</span>
                <div class="partner-info">
                    <div class="partner-name">${state.partner.nickname}</div>
                    <div class="partner-bind-time">绑定时间：${bindDate}</div>
                </div>
            </div>
        `;
        unbindArea.style.display = 'block';
    } else {
        partnerArea.innerHTML = `
            <div class="partner-card empty" onclick="switchPage('bind-page'); renderBindPage();">
                <span class="partner-avatar">🤝</span>
                <div class="partner-info">
                    <div class="partner-name">尚未绑定</div>
                    <div class="partner-bind-time">点击此处绑定你的另一半</div>
                </div>
            </div>
        `;
        unbindArea.style.display = 'none';
    }
    
    // 登录信息
    const loginInfoValue = document.getElementById('login-info-value');
    if (state.user) {
        if (state.user.loginType === 'wechat') {
            loginInfoValue.textContent = '微信登录';
        } else {
            loginInfoValue.textContent = state.user.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
        }
    } else {
        loginInfoValue.textContent = '--';
    }
}

function showLoginInfo() {
    showToast(state.user 
        ? (state.user.loginType === 'wechat' ? '当前为微信登录' : `当前手机号：${state.user.phone}`)
        : '未登录');
}

async function unbindPartner() {
    if (!confirm('确定要解除情侣绑定吗？解除后对方将无法收到你的订单。')) return;
    if (!confirm('再次确认：真的要解除吗？😢')) return;
    
    try {
        await API.unbindPartner();
    } catch (e) {
        // 即使 API 失败也清除本地状态
    }
    state.partner = null;
    renderSettings();
    showToast('已解除绑定');
}

async function doLogout() {
    if (!confirm('确定要退出登录吗？')) return;
    
    try {
        await API.logout();
    } catch (e) {
        // 即使 API 调用失败也继续退出
    }
    
    setToken(null);
    state.user = null;
    state.partner = null;
    state.myInviteCode = null;
    state.orderNote = '';
    state.currentRole = null;
    dishesCache = [];
    categoriesCache = [];
    lastCreatedOrder = null;
    
    dismissNotification();
    switchPage('login-page');
    document.getElementById('phone-input').value = '';
    document.getElementById('code-input').value = '';
    showToast('已退出登录');
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

// 留言输入实时字数统计
document.addEventListener('input', function(e) {
    if (e.target.id === 'order-note-input') {
        updateNoteCount();
    }
});