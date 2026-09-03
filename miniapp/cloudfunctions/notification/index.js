const cloud = require('wx-server-sdk');
cloud.init();
const db = cloud.database();

exports.main = async (event, context) => {
  const { action } = event;
  const { OPENID } = cloud.getWXContext();

  switch (action) {
    // 获取未读的菜品通知
    case 'getDishNotifs': {
      const { phone } = event;
      if (!phone) return { code: 0, notifs: [] };

      const res = await db.collection('notifications').where({
        userId: phone,
        type: db.command.in(['dish_added', 'dish_deleted']),
        read: false
      }).orderBy('createTime', 'desc').limit(5).get();

      return { code: 0, notifs: res.data || [] };
    }

    // 删除通知（处理完后删除，避免重复弹窗）
    case 'deleteNotifs': {
      const { ids } = event;
      if (!ids || !Array.isArray(ids)) return { code: 0 };

      for (let i = 0; i < ids.length; i++) {
        try {
          await db.collection('notifications').doc(ids[i]).remove();
        } catch (e) {
          console.error('删除通知失败:', e);
        }
      }
      return { code: 0 };
    }

    default:
      return { code: -1, msg: '未知操作' };
  }
};
