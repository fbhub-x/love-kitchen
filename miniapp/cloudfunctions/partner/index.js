// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init();

const db = cloud.database();
const _ = db.command;

// 邀请码过期时间：24小时（毫秒）
const INVITE_EXPIRE_DURATION = 24 * 60 * 60 * 1000;

// 云函数入口函数
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { action } = event;

  switch (action) {
    case 'createInvite':
      return createInvite(event, OPENID);
    case 'joinInvite':
      return joinInvite(event, OPENID);
    case 'unbind':
      return unbind(event, OPENID);
    case 'getPartner':
      return getPartner(event, OPENID);
    case 'getInviteStatus':
      return getInviteStatus(event, OPENID);
    default:
      return { code: -1, msg: '未知操作' };
  }
};

/**
 * 生成6位随机邀请码
 */
function generateInviteCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * 将日期值转换为时间戳
 * 兼容 Date 对象、ISO 字符串、数字
 */
function toTimestamp(dateVal) {
  if (!dateVal) return 0;
  if (typeof dateVal === 'number') return dateVal;
  return new Date(dateVal).getTime();
}

/**
 * 判断邀请码是否过期
 * 过期判断：Date.now() - inviteCodeCreatedAt > 24 * 60 * 60 * 1000
 */
function isInviteExpired(inviteCodeCreatedAt) {
  const createdAt = toTimestamp(inviteCodeCreatedAt);
  if (!createdAt) return true;
  return Date.now() - createdAt > INVITE_EXPIRE_DURATION;
}

/**
 * 计算剩余有效时间（毫秒）
 */
function getRemainingTime(inviteCodeCreatedAt) {
  const createdAt = toTimestamp(inviteCodeCreatedAt);
  if (!createdAt) return 0;
  const remaining = INVITE_EXPIRE_DURATION - (Date.now() - createdAt);
  return remaining > 0 ? remaining : 0;
}

/**
 * 生成邀请码
 * - 生成6位邀请码
 * - 记录 inviteCodeCreatedAt 时间戳，过期时间24小时
 * - 同一个用户再次生成会覆盖旧码
 * - 返回邀请码和过期时间
 */
async function createInvite(event, openid) {
  const { nickName, avatarUrl, gender, phone } = event;

  try {
    if (!phone) {
      return { code: -1, msg: '缺少手机号' };
    }

    // 生成6位邀请码
    const inviteCode = generateInviteCode();

    // 用手机号查询当前用户
    const userResult = await db.collection('users').where({
      phone: phone
    }).get();

    const now = Date.now();
    const expireAt = now + INVITE_EXPIRE_DURATION;

    if (userResult.data.length === 0) {
      // 用户记录不存在，创建新记录
      await db.collection('users').add({
        data: {
          _openid: openid,
          phone: phone,
          nickName,
          avatarUrl,
          gender,
          inviteCode,
          inviteCodeCreatedAt: db.serverDate(),
          partnerId: '',
          partnerPhone: '',
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      });
    } else {
      // 用户记录已存在，覆盖旧邀请码
      await db.collection('users').where({
        phone: phone
      }).update({
        data: {
          nickName,
          avatarUrl,
          gender,
          inviteCode,
          inviteCodeCreatedAt: db.serverDate(),
          updateTime: db.serverDate()
        }
      });
    }

    return {
      code: 0,
      msg: '邀请码生成成功',
      data: {
        inviteCode,
        inviteCodeCreatedAt: now,
        expireAt,
        expiresIn: INVITE_EXPIRE_DURATION
      }
    };
  } catch (err) {
    console.error('生成邀请码失败:', err);
    return { code: -1, msg: '生成邀请码失败', error: err.message };
  }
}

/**
 * 加入邀请（绑定情侣）
 * - 验证邀请码时检查是否过期（24小时），过期则返回"邀请码已过期"错误
 * - 双向绑定
 * - 绑定后清除邀请码
 */
async function joinInvite(event, openid) {
  const { inviteCode, nickName, avatarUrl, gender, phone } = event;

  try {
    if (!phone) {
      return { code: -1, msg: '缺少手机号' };
    }

    // 查找邀请码对应的用户
    const inviterResult = await db.collection('users').where({
      inviteCode
    }).get();

    if (inviterResult.data.length === 0) {
      return { code: -1, msg: '邀请码无效，未找到对应用户' };
    }

    const inviter = inviterResult.data[0];
    const inviterPhone = inviter.phone;

    // 不能绑定自己（用手机号判断）
    if (inviterPhone === phone) {
      return { code: -1, msg: '不能绑定自己' };
    }

    // 检查邀请码是否过期
    if (isInviteExpired(inviter.inviteCodeCreatedAt)) {
      return { code: -1, msg: '邀请码已过期' };
    }

    // 检查邀请者是否已绑定
    if (inviter.partnerId) {
      return { code: -1, msg: '该用户已绑定情侣，无法重复绑定' };
    }

    // 检查自己是否已绑定
    const selfResult = await db.collection('users').where({
      phone: phone
    }).get();

    if (selfResult.data.length > 0 && selfResult.data[0].partnerId) {
      return { code: -1, msg: '你已绑定情侣，无法重复绑定' };
    }

    // 更新自己的信息并绑定
    if (selfResult.data.length === 0) {
      // 用户记录不存在，创建新记录
      await db.collection('users').add({
        data: {
          _openid: openid,
          phone: phone,
          nickName,
          avatarUrl,
          gender,
          partnerId: inviter._openid || inviter.openid,
          partnerPhone: inviterPhone,
          inviteCode: '',
          inviteCodeCreatedAt: null,
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      });
    } else {
      await db.collection('users').where({
        phone: phone
      }).update({
        data: {
          nickName,
          avatarUrl,
          gender,
          partnerId: inviter._openid || inviter.openid,
          partnerPhone: inviterPhone,
          updateTime: db.serverDate()
        }
      });
    }

    // 双向绑定：更新邀请者的信息，并清除邀请码
    await db.collection('users').where({
      phone: inviterPhone
    }).update({
      data: {
        partnerId: openid,
        partnerPhone: phone,
        inviteCode: '',
        inviteCodeCreatedAt: null,
        updateTime: db.serverDate()
      }
    });

    return {
      code: 0,
      msg: '绑定成功'
    };
  } catch (err) {
    console.error('加入邀请失败:', err);
    return { code: -1, msg: '绑定失败', error: err.message };
  }
}

/**
 * 解除绑定
 * - 保持现有逻辑，双向解绑
 */
async function unbind(event, openid) {
  const { phone } = event;
  try {
    if (!phone) {
      return { code: -1, msg: '缺少手机号' };
    }

    // 获取当前用户信息
    const selfResult = await db.collection('users').where({
      phone: phone
    }).get();

    if (selfResult.data.length === 0) {
      return { code: -1, msg: '用户不存在' };
    }

    const self = selfResult.data[0];
    const partnerId = self.partnerId;
    const partnerPhone = self.partnerPhone;

    // 双向解除绑定
    if (partnerPhone) {
      await db.collection('users').where({
        phone: partnerPhone
      }).update({
        data: {
          partnerId: '',
          partnerPhone: '',
          updateTime: db.serverDate()
        }
      });

      // 通知对方
      await db.collection('notifications').add({
        data: {
          userId: partnerPhone,
          type: 'partner_unbound',
          title: '情侣关系已解除',
          content: '你的情侣已解除绑定',
          read: false,
          isRead: false,
          createdAt: db.serverDate()
        }
      });
    }

    // 解除自己的绑定
    await db.collection('users').where({
      phone: phone
    }).update({
      data: {
        partnerId: '',
        partnerPhone: '',
        updateTime: db.serverDate()
      }
    });

    return {
      code: 0,
      msg: '解除绑定成功'
    };
  } catch (err) {
    console.error('解除绑定失败:', err);
    return { code: -1, msg: '解除绑定失败', error: err.message };
  }
}

/**
 * 获取情侣信息
 * - 保持现有逻辑
 * - 返回的 partner 信息包含 nickname 和 avatar 字段（兼容前端用 nickname 而非 nickName）
 */
async function getPartner(event, openid) {
  const { phone } = event;
  try {
    if (!phone) {
      return { code: -1, msg: '缺少手机号' };
    }

    // 获取当前用户信息
    const selfResult = await db.collection('users').where({
      phone: phone
    }).get();

    if (selfResult.data.length === 0) {
      return { code: -1, msg: '用户不存在' };
    }

    const self = selfResult.data[0];

    if (!self.partnerId) {
      return {
        code: 0,
        msg: '未绑定情侣',
        data: { partner: null }
      };
    }

    // 用 partnerPhone 查询伴侣信息
    const partnerPhone = self.partnerPhone;
    if (!partnerPhone) {
      return {
        code: 0,
        msg: '未绑定情侣',
        data: { partner: null }
      };
    }

    const partnerResult = await db.collection('users').where({
      phone: partnerPhone
    }).get();

    if (partnerResult.data.length === 0) {
      return {
        code: 0,
        msg: '情侣不存在',
        data: { partner: null }
      };
    }

    const partner = partnerResult.data[0];

    return {
      code: 0,
      msg: '获取成功',
      data: {
        partner: {
          openid: partner._openid || partner.openid,
          phone: partner.phone,
          nickname: partner.nickname || partner.nickName,
          avatar: partner.avatar || partner.avatarUrl,
          role: partner.role
        }
      }
    };
  } catch (err) {
    console.error('获取情侣信息失败:', err);
    return { code: -1, msg: '获取情侣信息失败', error: err.message };
  }
}

/**
 * 查询当前用户的邀请码状态
 * - 是否有效、是否过期、剩余时间
 */
async function getInviteStatus(event, openid) {
  const { phone } = event;
  try {
    if (!phone) {
      return { code: -1, msg: '缺少手机号' };
    }

    // 获取当前用户信息
    const selfResult = await db.collection('users').where({
      phone: phone
    }).get();

    // 用户不存在或没有邀请码
    if (selfResult.data.length === 0 || !selfResult.data[0].inviteCode) {
      return {
        code: 0,
        msg: '查询成功',
        data: {
          hasInviteCode: false,
          valid: false,
          expired: false,
          inviteCode: '',
          remainingTime: 0,
          remainingSeconds: 0
        }
      };
    }

    const self = selfResult.data[0];

    // 检查邀请码是否过期
    const expired = isInviteExpired(self.inviteCodeCreatedAt);
    const remainingTime = getRemainingTime(self.inviteCodeCreatedAt);
    const createdAt = toTimestamp(self.inviteCodeCreatedAt);

    return {
      code: 0,
      msg: '查询成功',
      data: {
        hasInviteCode: true,
        valid: !expired,
        expired,
        inviteCode: self.inviteCode,
        inviteCodeCreatedAt: createdAt,
        expireAt: createdAt + INVITE_EXPIRE_DURATION,
        remainingTime,
        remainingSeconds: Math.floor(remainingTime / 1000)
      }
    };
  } catch (err) {
    console.error('查询邀请码状态失败:', err);
    return { code: -1, msg: '查询邀请码状态失败', error: err.message };
  }
}
