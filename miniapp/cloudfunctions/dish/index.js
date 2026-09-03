const cloud = require('wx-server-sdk');
cloud.init();
const db = cloud.database();

// 发通知给伴侣
async function notifyPartner(chefPhone, type, dishName) {
  if (!chefPhone) return;
  try {
    const userRes = await db.collection('users').where({ phone: chefPhone }).get();
    if (userRes.data && userRes.data.length > 0) {
      const user = userRes.data[0];
      if (user.partnerPhone && user.partnerPhone !== chefPhone) {
        await db.collection('notifications').add({
          data: {
            userId: user.partnerPhone,
            type: type,            // 'dish_added' 或 'dish_deleted'
            title: type === 'dish_added' ? '新增菜品' : '删除菜品',
            content: dishName,
            isRead: false,
            read: false,
            createTime: db.serverDate()
          }
        });
      }
    }
  } catch (e) {
    console.error('发通知失败:', e);
  }
}

exports.main = async (event, context) => {
  const { action } = event;
  const { OPENID } = cloud.getWXContext();

  switch (action) {
    // 新增菜品
    case 'add': {
      const { name, emoji, category, desc, time, chefPhone, specs } = event;
      const res = await db.collection('dishes').add({
        data: {
          name,
          emoji,
          category,
          desc,
          time,
          specs: Array.isArray(specs) ? specs : [],
          createdBy: OPENID,
          chefPhone: chefPhone || '',
          createdAt: db.serverDate()
        }
      });

      // 发通知给伴侣
      await notifyPartner(chefPhone, 'dish_added', name);

      return { code: 0, dishId: res._id };
    }

    // 修改菜品（不发通知）
    case 'update': {
      const { dishId, name, emoji, category, desc, time, specs } = event;
      await db.collection('dishes').doc(dishId).update({
        data: { name, emoji, category, desc, time, specs: Array.isArray(specs) ? specs : [] }
      });
      return { code: 0 };
    }

    // 删除菜品
    case 'delete': {
      const { dishId, chefPhone } = event;

      // 先查出菜品名（删除前）
      let dishName = '';
      try {
        const dishRes = await db.collection('dishes').doc(dishId).get();
        if (dishRes.data) {
          dishName = dishRes.data.name || '';
        }
      } catch (e) {}

      // 删除菜品
      await db.collection('dishes').doc(dishId).remove();

      // 发通知给伴侣
      await notifyPartner(chefPhone, 'dish_deleted', dishName);

      return { code: 0 };
    }

    // 获取菜品（系统默认菜品所有人可见 + 用户自己/伴侣的菜品，去重）
    case 'list': {
      const { phones } = event;
      const res = await db.collection('dishes').orderBy('createdAt', 'desc').limit(100).get();
      let dishes = res.data || [];

      if (phones && Array.isArray(phones) && phones.length > 0) {
        // 过滤：系统默认菜品 + 自己/伴侣的菜品
        let filtered = dishes.filter(function (d) {
          if (!d.chefPhone) return true;
          if (phones.indexOf(d.chefPhone) !== -1) return true;
          return false;
        });

        // 按菜品名称去重（同名只保留一条）
        let seen = {};
        dishes = filtered.filter(function (d) {
          var name = (d.name || '').trim();
          if (seen[name]) return false;
          seen[name] = true;
          return true;
        });
      }

      return { code: 0, dishes: dishes };
    }

    default:
      return { code: -1, msg: '未知操作' };
    }
};
