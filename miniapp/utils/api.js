const db = wx.cloud.database();
const _ = db.command;

// 获取用户 openid + 检查是否新用户
async function getOpenid() {
  const res = await wx.cloud.callFunction({
    name: 'login',
    data: { action: 'login' }
  });
  return res.result.data.openid;
}

// 登录并获取用户信息
async function login() {
  const res = await wx.cloud.callFunction({
    name: 'login',
    data: { action: 'login' }
  });
  if (res.result && res.result.code === 0) {
    return res.result.data;
  }
  throw new Error('登录失败');
}

// 检查登录：手机号+密码，判断新/老用户
async function checkLogin(phone, password) {
  const res = await wx.cloud.callFunction({
    name: 'login',
    data: { action: 'checkLogin', phone, password }
  });
  if (res.result && res.result.code === 0) {
    return res.result.data;
  }
  throw new Error(res.result ? res.result.msg : '检查失败');
}

// 注册新用户（用手机号+密码作为唯一标识）
async function register(phone, role, nickname, avatar, password) {
  const res = await wx.cloud.callFunction({
    name: 'login',
    data: { action: 'register', phone, role, nickname, avatar, password }
  });
  if (res.result && res.result.code === 0) {
    return res.result.data;
  }
  throw new Error(res.result ? res.result.msg : '注册失败');
}

// 通过手机号查询用户
async function getUserByPhone(phone) {
  const res = await wx.cloud.callFunction({
    name: 'login',
    data: { action: 'getUserByPhone', phone }
  });
  if (res.result && res.result.code === 0) {
    return res.result.data;
  }
  return null;
}

// 设置角色（兼容旧代码，实际用 register）
async function setRole(openid, role, nickname, avatar) {
  return register('', role, nickname, avatar);
}

// 获取用户信息（兼容旧代码）
async function getUser(openid) {
  const data = await getUserInfo(openid);
  return data ? data.user : null;
}

// 生成邀请码（通过云函数，带过期机制）
async function createInvite(openid, phone) {
  const res = await wx.cloud.callFunction({
    name: 'partner',
    data: { action: 'createInvite', phone: phone }
  });
  if (res.result && res.result.code === 0) {
    return res.result.data;
  }
  throw new Error(res.result ? res.result.msg : '生成邀请码失败');
}

// 查询邀请码状态
async function getInviteStatus() {
  const res = await wx.cloud.callFunction({
    name: 'partner',
    data: { action: 'getInviteStatus' }
  });
  if (res.result && res.result.code === 0) {
    return res.result.data;
  }
  return null;
}

// 加入邀请码（通过云函数）
async function joinInvite(openid, code, phone) {
  const res = await wx.cloud.callFunction({
    name: 'partner',
    data: { action: 'joinInvite', inviteCode: code, phone: phone }
  });
  if (res.result && res.result.code === 0) {
    return res.result.data;
  }
  throw new Error(res.result ? res.result.msg : '加入失败');
}

// 解除绑定（通过云函数）
async function unbind(openid, phone) {
  const res = await wx.cloud.callFunction({
    name: 'partner',
    data: { action: 'unbind', phone: phone }
  });
  if (res.result && res.result.code === 0) {
    return res.result.data;
  }
  throw new Error(res.result ? res.result.msg : '解除绑定失败');
}

// 获取菜品（通过云函数，按手机号过滤）
async function getDishes(chefPhone) {
  const res = await wx.cloud.callFunction({
    name: 'dish',
    data: { action: 'list', chefPhone: chefPhone || '' }
  });
  if (res.result && res.result.code === 0) {
    return res.result.dishes;
  }
  return [];
}

// 创建订单（用手机号作为用户标识）
async function createOrder(phone, items, note) {
  const res = await wx.cloud.callFunction({
    name: 'order',
    data: {
      action: 'createOrder',
      girlId: phone,
      items: items,
      note: note || ''
    }
  });
  if (res.result && res.result.code === 0) {
    return res.result.data.orderId;
  } else {
    throw new Error(res.result ? res.result.msg : '下单失败');
  }
}

// 获取订单（女方）- 用手机号查询
async function getGirlOrders(phone) {
  const res = await wx.cloud.callFunction({
    name: 'order',
    data: { action: 'getOrders', role: 'girl', userId: phone }
  });
  if (res.result && res.result.code === 0) {
    return res.result.data;
  }
  return [];
}

// 获取订单（男方）- 用手机号查询
async function getBoyOrders(phone) {
  const res = await wx.cloud.callFunction({
    name: 'order',
    data: { action: 'getOrders', role: 'boy', userId: phone }
  });
  if (res.result && res.result.code === 0) {
    return res.result.data;
  }
  return [];
}

// 更新订单状态 - 通过云函数
async function updateOrderStatus(orderId, status) {
  const res = await wx.cloud.callFunction({
    name: 'order',
    data: { action: 'updateStatus', orderId: orderId, status: status }
  });
  if (res.result && res.result.code === 0) {
    return res.result;
  }
  throw new Error(res.result ? res.result.msg : '更新失败');
}

// 获取通知数量
async function getNotificationCount(phone) {
  const res = await db.collection('notifications')
    .where({ userId: phone, read: false })
    .get();
  const counts = { newOrder: 0, completed: 0, partnerJoined: 0, partnerUnbound: 0 };
  res.data.forEach(n => {
    if (n.type === 'new_order') counts.newOrder++;
    else if (n.type === 'order_completed') counts.completed++;
    else if (n.type === 'partner_joined') counts.partnerJoined++;
    else if (n.type === 'partner_unbound') counts.partnerUnbound++;
  });
  return counts;
}

// 标记通知已读（按类型批量标记）
async function markRead(phone, type) {
  await db.collection('notifications')
    .where({ userId: phone, type, read: false })
    .update({ data: { read: true } });
}

// 标记单条通知已读（按 _id）
async function markNotifReadById(notifId) {
  await db.collection('notifications').doc(notifId).update({
    data: { read: true }
  });
}

// 获取伴侣信息（通过云函数）
async function getPartner(openid, phone) {
  const res = await wx.cloud.callFunction({
    name: 'partner',
    data: { action: 'getPartner', phone: phone }
  });
  if (res.result && res.result.code === 0 && res.result.data.partner) {
    return res.result.data.partner;
  }
  return null;
}

// 监听订单变化（男方）
function watchBoyOrders(openid, callback) {
  return db.collection('orders')
    .where({ boyId: openid })
    .watch({ onChange: snapshot => callback(snapshot.docs), onError: err => console.error(err) });
}

// 监听订单变化（女方）
function watchGirlOrders(openid, callback) {
  return db.collection('orders')
    .where({ girlId: openid })
    .watch({ onChange: snapshot => callback(snapshot.docs), onError: err => console.error(err) });
}

// 监听通知（用手机号作为 userId）
function watchNotifications(phone, callback) {
  return db.collection('notifications')
    .where({ userId: phone, read: false })
    .watch({ onChange: snapshot => callback(snapshot.docs), onError: err => console.error(err) });
}

// 修改密码
async function changePassword(phone, oldPassword, newPassword) {
  const res = await wx.cloud.callFunction({
    name: 'login',
    data: { action: 'changePassword', phone, oldPassword, newPassword }
  });
  if (res.result && res.result.code === 0) {
    return res.result.data;
  }
  throw new Error(res.result ? res.result.msg : '修改密码失败');
}

// 注销账号
async function deleteAccount(phone) {
  const res = await wx.cloud.callFunction({
    name: 'login',
    data: { action: 'deleteAccount', phone }
  });
  if (res.result && res.result.code === 0) {
    return res.result.data;
  }
  throw new Error(res.result ? res.result.msg : '注销失败');
}

module.exports = {
  getOpenid, login, checkLogin, register, getUserByPhone, setRole, getUser,
  createInvite, getInviteStatus, joinInvite, unbind, getPartner,
  getDishes, createOrder, getGirlOrders, getBoyOrders, updateOrderStatus,
  getNotificationCount, markRead, markNotifReadById,
  watchBoyOrders, watchGirlOrders, watchNotifications, changePassword, deleteAccount
};