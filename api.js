// ==================== API 通信层 ====================
const API_BASE = 'http://localhost:3000';

// 存储 token
let authToken = sessionStorage.getItem('loveKitchenToken') || null;

function setToken(token) {
    authToken = token;
    if (token) {
        sessionStorage.setItem('loveKitchenToken', token);
    } else {
        sessionStorage.removeItem('loveKitchenToken');
    }
}

async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
        headers['Authorization'] = authToken;
    }
    const res = await fetch(API_BASE + path, { ...options, headers });
    const data = await res.json();
    if (!res.ok) {
        if (res.status === 401) {
            setToken(null);
        }
        throw new Error(data.error || '请求失败');
    }
    return data;
}

// 用户
const API = {
    login: (phone, nickname, avatar, loginType) =>
        api('/api/login', { method: 'POST', body: JSON.stringify({ phone, nickname, avatar, loginType }) }),
    getUser: () => api('/api/user'),
    updateUser: (data) => api('/api/user', { method: 'PUT', body: JSON.stringify(data) }),
    logout: () => api('/api/logout', { method: 'POST' }),

    // 菜品
    getDishes: () => api('/api/dishes'),
    addDish: (data) => api('/api/dishes', { method: 'POST', body: JSON.stringify(data) }),
    updateDish: (id, data) => api('/api/dishes/' + id, { method: 'PUT', body: JSON.stringify(data) }),
    updateSystemDish: (id, data) => api('/api/dishes/system/' + id, { method: 'PUT', body: JSON.stringify(data) }),
    deleteDish: (id) => api('/api/dishes/' + id, { method: 'DELETE' }),

    // 分类
    getCategories: () => api('/api/categories'),
    addCategory: (data) => api('/api/categories', { method: 'POST', body: JSON.stringify(data) }),

    // 购物车
    getCart: () => api('/api/cart'),
    addToCart: (data) => api('/api/cart', { method: 'POST', body: JSON.stringify(data) }),
    removeFromCart: (dishId) => api('/api/cart/' + dishId, { method: 'DELETE' }),
    clearCart: () => api('/api/cart', { method: 'DELETE' }),

    // 订单
    getOrders: () => api('/api/orders'),
    createOrder: (data) => api('/api/orders', { method: 'POST', body: JSON.stringify(data) }),
    updateOrderStatus: (id, status) => api('/api/orders/' + id + '/status', { method: 'PUT', body: JSON.stringify({ status }) }),

    // 通知
    getNotificationCount: () => api('/api/notifications/count'),
    markNotificationsRead: (type) => api('/api/notifications/read', { method: 'PUT', body: JSON.stringify({ type: type || null }) }),

    // 邀请码
    createInvitation: () => api('/api/invitations', { method: 'POST' }),
    joinInvitation: (code) => api('/api/invitations/join', { method: 'POST', body: JSON.stringify({ code }) }),

    // 伴侣
    getPartner: () => api('/api/partner'),
    unbindPartner: () => api('/api/partner', { method: 'DELETE' }),
};