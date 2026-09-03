// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init();

const db = cloud.database();

// 简单 hash 函数（不依赖外部库）
function hashPassword(password, phone) {
  const crypto = require('crypto');
  // 用 phone 作为 salt，增加安全性
  return crypto.createHash('sha256').update(phone + ':' + password).digest('hex');
}

// 云函数入口函数
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { action = 'login' } = event;

  try {
    switch (action) {
      case 'login':
        return await handleLogin(OPENID, event);
      case 'register':
        return await handleRegister(OPENID, event);
      case 'updateProfile':
        return await handleUpdateProfile(OPENID, event);
      case 'getUserByPhone':
        return await handleGetUserByPhone(OPENID, event);
      case 'changePassword':
        return await handleChangePassword(OPENID, event);
      case 'checkLogin':
        return await handleCheckLogin(OPENID, event);
      case 'deleteAccount':
        return await handleDeleteAccount(OPENID, event);
      default:
        return await handleLogin(OPENID, event);
    }
  } catch (err) {
    console.error('login 云函数异常:', err);
    return {
      code: -1,
      msg: '服务器异常: ' + err.message,
      data: {}
    };
  }
};

// 登录：返回 openid
async function handleLogin(openid, event) {
  if (!openid) {
    return { code: -1, msg: '无法获取 openid', data: {} };
  }
  return {
    code: 0,
    msg: 'ok',
    data: { openid: openid }
  };
}

// 检查登录：手机号+密码，判断是新用户还是老用户
// 新用户 → 返回 isNew: true（不创建记录）
// 老用户密码正确 → 返回 isNew: false, user
// 老用户密码错误 → 返回 code: -1
async function handleCheckLogin(openid, event) {
  const { phone, password } = event;

  if (!phone) {
    return { code: -1, msg: '缺少手机号', data: {} };
  }
  if (!password || password.length !== 6) {
    return { code: -1, msg: '密码必须是6位数字', data: {} };
  }

  const user = await queryUserByPhone(phone);

  if (!user) {
    // 新用户
    return { code: 0, msg: 'ok', data: { isNew: true } };
  }

  // 老用户
  const hashedPassword = hashPassword(password, phone);

  if (user.password) {
    // 已有密码 → 验证
    if (user.password !== hashedPassword) {
      return { code: -1, msg: '密码错误', data: {} };
    }
  } else {
    // 老用户没有密码 → 直接设置密码
    await db.collection('users').doc(user._id).update({
      data: { password: hashedPassword, _openid: openid }
    });
  }

  // 更新 openid
  if (user._openid !== openid) {
    await db.collection('users').doc(user._id).update({
      data: { _openid: openid }
    });
    user._openid = openid;
  }

  delete user.password;
  return { code: 0, msg: 'ok', data: { isNew: false, user: user } };
}

// 更新个人信息（只改头像和昵称，不校验密码）
async function handleUpdateProfile(openid, event) {
  const { phone, nickname, avatar } = event;

  if (!phone) {
    return { code: -1, msg: '缺少手机号', data: {} };
  }

  const existUser = await queryUserByPhone(phone);
  if (!existUser) {
    return { code: -1, msg: '用户不存在', data: {} };
  }

  const updateData = {
    nickname: nickname || existUser.nickname || '',
    avatar: avatar || existUser.avatar || ''
  };

  await db.collection('users').doc(existUser._id).update({
    data: updateData
  });

  const updatedUser = Object.assign({}, existUser, updateData);
  return { code: 0, msg: 'ok', data: { user: updatedUser } };
}

// 注册：用手机号+密码作为唯一标识，创建或更新用户
async function handleRegister(openid, event) {
  const { phone, role, nickname, avatar, password } = event;

  if (!phone) {
    return { code: -1, msg: '缺少手机号', data: {} };
  }
  if (!role) {
    return { code: -1, msg: '缺少角色信息', data: {} };
  }
  if (!password || password.length !== 6) {
    return { code: -1, msg: '密码必须是6位数字', data: {} };
  }

  // 密码加密
  const hashedPassword = hashPassword(password, phone);

  // 用手机号查询是否已有用户
  const existUser = await queryUserByPhone(phone);

  if (existUser) {
    // 该手机号已注册
    if (existUser.password) {
      // 已有密码 → 验证密码
      if (existUser.password !== hashedPassword) {
        return { code: -1, msg: '密码错误', data: {} };
      }
    }
    // 没有密码（老用户）→ 直接设置密码

    // 密码正确或首次设置密码，更新信息并返回
    const updateData = {
      _openid: openid,
      role: role,
      nickname: nickname || existUser.nickname || '',
      avatar: avatar || existUser.avatar || '',
      password: hashedPassword
    };

    await db.collection('users').doc(existUser._id).update({
      data: updateData
    });

    const updatedUser = Object.assign({}, existUser, updateData);
    delete updatedUser.password; // 不返回密码

    return {
      code: 0,
      msg: '登录成功',
      data: { isNew: false, user: updatedUser }
    };
  }

  // 新用户，创建记录
  const userData = {
    _openid: openid,
    phone: phone,
    role: role,
    nickname: nickname || '',
    avatar: avatar || '',
    password: hashedPassword,
    partnerId: null,
    partnerPhone: null,
    inviteCode: '',
    createdAt: db.serverDate()
  };

  const addRes = await db.collection('users').add({ data: userData });
  userData._id = addRes._id;
  delete userData.password; // 不返回密码

  return {
    code: 0,
    msg: '注册成功',
    data: { isNew: true, user: userData }
  };
}

// 通过手机号查询用户（用于自动登录，不验证密码）
async function handleGetUserByPhone(openid, event) {
  const { phone } = event;
  if (!phone) {
    return { code: -1, msg: '缺少手机号', data: {} };
  }

  const user = await queryUserByPhone(phone);
  if (!user) {
    return { code: 0, msg: 'ok', data: { isNew: true, user: null } };
  }

  // 更新 openid（可能换了微信账号）
  if (user._openid !== openid) {
    await db.collection('users').doc(user._id).update({
      data: { _openid: openid }
    });
    user._openid = openid;
  }

  delete user.password; // 不返回密码
  return { code: 0, msg: 'ok', data: { isNew: false, user: user } };
}

// 修改密码：验证旧密码后设置新密码
async function handleChangePassword(openid, event) {
  const { phone, oldPassword, newPassword } = event;

  if (!phone) {
    return { code: -1, msg: '缺少手机号', data: {} };
  }
  if (!oldPassword || oldPassword.length !== 6) {
    return { code: -1, msg: '旧密码格式错误', data: {} };
  }
  if (!newPassword || newPassword.length !== 6) {
    return { code: -1, msg: '新密码必须是6位数字', data: {} };
  }

  const user = await queryUserByPhone(phone);
  if (!user) {
    return { code: -1, msg: '用户不存在', data: {} };
  }

  // 验证旧密码
  const oldHash = hashPassword(oldPassword, phone);
  if (user.password !== oldHash) {
    return { code: -1, msg: '旧密码错误', data: {} };
  }

  // 更新为新密码
  const newHash = hashPassword(newPassword, phone);
  await db.collection('users').doc(user._id).update({
    data: { password: newHash }
  });

  return { code: 0, msg: '密码修改成功', data: {} };
}

// 注销账号：删除用户所有数据
async function handleDeleteAccount(openid, event) {
  const { phone } = event;

  if (!phone) {
    return { code: -1, msg: '缺少手机号', data: {} };
  }

  const user = await queryUserByPhone(phone);
  if (!user) {
    return { code: -1, msg: '用户不存在', data: {} };
  }

  // 1. 如果有伴侣，解除伴侣的绑定
  if (user.partnerPhone) {
    const partnerRes = await db.collection('users').where({ phone: user.partnerPhone }).get();
    if (partnerRes.data && partnerRes.data.length > 0) {
      const partner = partnerRes.data[0];
      await db.collection('users').doc(partner._id).update({
        data: {
          partnerId: null,
          partnerPhone: null,
          inviteCode: ''
        }
      });
    }
  }

  // 2. 删除用户创建的菜品（dishes 表，by createdBy = openid）
  const dishesRes = await db.collection('dishes').where({ createdBy: openid }).get();
  for (let i = 0; i < dishesRes.data.length; i++) {
    await db.collection('dishes').doc(dishesRes.data[i]._id).remove();
  }

  // 3. 删除相关订单（orders 表，girlId 或 boyId = phone）
  const ordersAsGirl = await db.collection('orders').where({ girlId: phone }).get();
  for (let i = 0; i < ordersAsGirl.data.length; i++) {
    await db.collection('orders').doc(ordersAsGirl.data[i]._id).remove();
  }
  const ordersAsBoy = await db.collection('orders').where({ boyId: phone }).get();
  for (let i = 0; i < ordersAsBoy.data.length; i++) {
    await db.collection('orders').doc(ordersAsBoy.data[i]._id).remove();
  }

  // 4. 删除相关通知（notifications 表，userId = phone）
  const notifsRes = await db.collection('notifications').where({ userId: phone }).get();
  for (let i = 0; i < notifsRes.data.length; i++) {
    await db.collection('notifications').doc(notifsRes.data[i]._id).remove();
  }

  // 5. 删除用户记录本身
  await db.collection('users').doc(user._id).remove();

  return { code: 0, msg: '账号已注销', data: {} };
}

// 通过手机号查询用户
async function queryUserByPhone(phone) {
  const res = await db.collection('users').where({ phone: phone }).get();
  if (res.data && res.data.length > 0) {
    return res.data[0];
  }
  return null;
}
