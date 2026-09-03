// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init();

const db = cloud.database();
const _ = db.command;

// 云函数入口函数
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { action } = event;

  switch (action) {
    case 'createOrder':
      return createOrder(event, OPENID);
    case 'updateStatus':
      return updateStatus(event, OPENID);
    case 'getOrders':
      return getOrders(event, OPENID);
    default:
      return { code: -1, msg: '未知操作' };
  }
};

/**
 * 创建订单
 * event 参数: girlId, items, note
 */
async function createOrder(event, openid) {
  const { girlId, items, note } = event;

  try {
    // girlId 是手机号，通过手机号查询用户信息获取伴侣手机号
    let boyId = '';

    try {
      const userRes = await db.collection('users').where({ phone: girlId }).get();
      if (userRes.data && userRes.data.length > 0) {
        const user = userRes.data[0];
        // 直接用 partnerPhone 字段（绑定后会有此字段）
        if (user.partnerPhone && user.partnerPhone !== girlId) {
          boyId = user.partnerPhone;
        } else {
          // 未绑定，boyId 设为自己
          boyId = girlId;
        }
      } else {
        boyId = girlId;
      }
    } catch (e) {
      console.log('用户记录查询失败，允许继续下单');
      boyId = girlId;
    }

    const orderId = 'ORD' + Date.now();
    const now = db.serverDate();

    // 创建订单
    await db.collection('orders').add({
      data: {
        orderId: orderId,
        girlId: girlId,
        boyId: boyId,
        items: items,
        note: note || '',
        status: 'pending',
        createdAt: now,
        updateTime: now
      }
    });

    // 只有绑定了伴侣才创建通知给男方
    // 未绑定时男方通过 watchBoyOrders 检测新订单，不需要通知
    if (boyId && boyId !== girlId) {
      await db.collection('notifications').add({
        data: {
          userId: boyId,
          type: 'new_order',
          orderId: orderId,
          title: '新订单',
          content: '收到一个新的订单，请查看',
          read: false,
          isRead: false,
          createdAt: now
        }
      });
    }

    return {
      code: 0,
      msg: '创建成功',
      data: { orderId: orderId }
    };
  } catch (err) {
    console.error('创建订单失败:', err);
    return { code: -1, msg: '创建订单失败: ' + (err.message || '未知错误'), error: err.message };
  }
}

/**
 * 更新订单状态
 * event 参数: orderId, status
 */
async function updateStatus(event, openid) {
  const { orderId, status } = event;

  try {
    // 通过 orderId 查找订单
    const orderRes = await db.collection('orders').where({ orderId }).get();
    if (!orderRes.data || orderRes.data.length === 0) {
      return { code: -1, msg: '订单不存在' };
    }

    const orderDocId = orderRes.data[0]._id;

    await db.collection('orders').doc(orderDocId).update({
      data: {
        status: status,
        updateTime: db.serverDate()
      }
    });

    // 如果订单完成，通知女方
    if (status === 'completed') {
      const orderData = orderRes.data[0];

      if (orderData.girlId) {
        await db.collection('notifications').add({
          data: {
            userId: orderData.girlId,
            type: 'order_completed',
            orderId: orderId,
            title: '订单已完成',
            content: '你的订单已被标记为完成',
            read: false,
            isRead: false,
            createdAt: db.serverDate()
          }
        });
      }
    }

    return {
      code: 0,
      msg: '更新成功'
    };
  } catch (err) {
    console.error('更新订单状态失败:', err);
    return { code: -1, msg: '更新订单状态失败', error: err.message };
  }
}

/**
 * 获取订单列表
 * event 参数: role, userId
 */
async function getOrders(event, openid) {
  const { role, userId } = event;

  try {
    let query = {};
    if (role === 'girl') {
      query = { girlId: userId };
    } else {
      query = { boyId: userId };
    }

    const result = await db.collection('orders')
      .where(query)
      .orderBy('createdAt', 'desc')
      .get();

    return {
      code: 0,
      msg: '查询成功',
      data: result.data
    };
  } catch (err) {
    console.error('获取订单失败:', err);
    return { code: -1, msg: '获取订单失败', error: err.message };
  }
}
