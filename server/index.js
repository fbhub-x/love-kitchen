const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;

// ==================== 中间件：验证用户身份 ====================
async function auth(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ error: '未登录' });
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE token = ?', [token]);
        if (rows.length === 0) return res.status(401).json({ error: '登录已过期' });
        req.user = rows[0];
        next();
    } catch (err) {
        res.status(500).json({ error: '服务器错误' });
    }
}

// ==================== 用户 API ====================

// 注册/登录
app.post('/api/login', async (req, res) => {
    const { phone, nickname, avatar, loginType } = req.body;
    if (!phone) return res.status(400).json({ error: '手机号不能为空' });

    try {
        let [users] = await pool.query('SELECT * FROM users WHERE phone = ?', [phone]);
        let user;

        if (users.length > 0) {
            user = users[0];
            // 更新昵称和头像（如果提供了）
            if (nickname || avatar) {
                const newNick = nickname || user.nickname;
                const newAvatar = avatar || user.avatar;
                await pool.query(
                    'UPDATE users SET nickname = ?, avatar = ?, login_type = ? WHERE id = ?',
                    [newNick, newAvatar, loginType || 'phone', user.id]
                );
                user.nickname = newNick;
                user.avatar = newAvatar;
            }
        } else {
            // 注册新用户
            const finalNickname = nickname || '小可爱';
            const finalAvatar = avatar || '😊';
            const [result] = await pool.query(
                'INSERT INTO users (phone, nickname, avatar, login_type) VALUES (?, ?, ?, ?)',
                [phone, finalNickname, finalAvatar, loginType || 'phone']
            );
            user = { id: result.insertId, phone, nickname: finalNickname, avatar: finalAvatar, login_type: loginType || 'phone' };
        }

        // 生成 token
        const token = crypto.randomBytes(32).toString('hex');
        await pool.query('UPDATE users SET token = ? WHERE id = ?', [token, user.id]);

        res.json({
            token,
            user: { id: user.id, phone: user.phone, nickname: user.nickname, avatar: user.avatar, loginType: user.login_type }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '登录失败' });
    }
});

// 获取当前用户信息
app.get('/api/user', auth, async (req, res) => {
    res.json({
        user: { id: req.user.id, phone: req.user.phone, nickname: req.user.nickname, avatar: req.user.avatar, loginType: req.user.login_type }
    });
});

// 更新用户信息
app.put('/api/user', auth, async (req, res) => {
    const { nickname, avatar } = req.body;
    try {
        if (nickname) {
            await pool.query('UPDATE users SET nickname = ? WHERE id = ?', [nickname, req.user.id]);
        }
        if (avatar) {
            await pool.query('UPDATE users SET avatar = ? WHERE id = ?', [avatar, req.user.id]);
        }
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
        const user = rows[0];
        res.json({
            user: { id: user.id, phone: user.phone, nickname: user.nickname, avatar: user.avatar, loginType: user.login_type }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '更新失败' });
    }
});

// 登出
app.post('/api/logout', auth, async (req, res) => {
    await pool.query('UPDATE users SET token = NULL WHERE id = ?', [req.user.id]);
    res.json({ success: true });
});

// ==================== 菜品 API ====================

// 获取系统菜品 + 用户自定义菜品
app.get('/api/dishes', auth, async (req, res) => {
    try {
        const [dishes] = await pool.query(
            'SELECT * FROM dishes WHERE is_system = 1 OR user_id = ? ORDER BY is_system DESC, id ASC',
            [req.user.id]
        );
        res.json({ dishes: dishes.map(d => ({
            id: d.id,
            name: d.name,
            desc: d.desc_text,
            emoji: d.emoji,
            category: d.category,
            time: d.time,
            isSystem: !!d.is_system,
            userId: d.user_id
        })) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取菜品失败' });
    }
});

// 添加自定义菜品
app.post('/api/dishes', auth, async (req, res) => {
    const { name, desc, emoji, category, time } = req.body;
    if (!name) return res.status(400).json({ error: '菜品名称不能为空' });
    try {
        const [result] = await pool.query(
            'INSERT INTO dishes (user_id, name, desc_text, emoji, category, time, is_system) VALUES (?, ?, ?, ?, ?, ?, 0)',
            [req.user.id, name, desc || '', emoji || '🍽️', category || 'home', time || '20分钟']
        );
        res.json({ dish: { id: result.insertId, name, desc: desc || '', emoji: emoji || '🍽️', category: category || 'home', time: time || '20分钟', isSystem: false } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '添加菜品失败' });
    }
});

// 更新自定义菜品
app.put('/api/dishes/:id', auth, async (req, res) => {
    const { name, desc, emoji, category, time } = req.body;
    try {
        const [rows] = await pool.query('SELECT * FROM dishes WHERE id = ? AND user_id = ? AND is_system = 0', [req.params.id, req.user.id]);
        if (rows.length === 0) return res.status(404).json({ error: '菜品不存在或不可编辑' });

        await pool.query(
            'UPDATE dishes SET name = ?, desc_text = ?, emoji = ?, category = ?, time = ? WHERE id = ?',
            [name, desc || '', emoji || '🍽️', category || 'home', time || '20分钟', req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '更新菜品失败' });
    }
});

// 更新系统菜品（管理员功能，这里简化：允许所有用户修改）
app.put('/api/dishes/system/:id', auth, async (req, res) => {
    const { name, desc, emoji, category, time } = req.body;
    try {
        const [rows] = await pool.query('SELECT * FROM dishes WHERE id = ? AND is_system = 1', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: '系统菜品不存在' });

        await pool.query(
            'UPDATE dishes SET name = ?, desc_text = ?, emoji = ?, category = ?, time = ? WHERE id = ?',
            [name, desc || '', emoji || '🍽️', category || 'home', time || '20分钟', req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '更新失败' });
    }
});

// 删除自定义菜品
app.delete('/api/dishes/:id', auth, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM dishes WHERE id = ? AND user_id = ? AND is_system = 0', [req.params.id, req.user.id]);
        if (rows.length === 0) return res.status(404).json({ error: '菜品不存在或不可删除' });

        await pool.query('DELETE FROM dishes WHERE id = ?', [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '删除失败' });
    }
});

// ==================== 分类 API ====================

// 获取自定义分类
app.get('/api/categories', auth, async (req, res) => {
    try {
        const [cats] = await pool.query('SELECT * FROM categories WHERE user_id = ?', [req.user.id]);
        res.json({ categories: cats.map(c => ({ key: c.cat_key, icon: c.icon, label: c.label })) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取分类失败' });
    }
});

// 添加自定义分类
app.post('/api/categories', auth, async (req, res) => {
    const { catKey, icon, label } = req.body;
    if (!catKey || !label) return res.status(400).json({ error: '分类信息不完整' });
    try {
        await pool.query(
            'INSERT INTO categories (user_id, cat_key, icon, label) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE icon = VALUES(icon), label = VALUES(label)',
            [req.user.id, catKey, icon || '🍽️', label]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '添加分类失败' });
    }
});

// ==================== 购物车 API ====================

// 获取购物车
app.get('/api/cart', auth, async (req, res) => {
    try {
        const [items] = await pool.query('SELECT * FROM cart_items WHERE user_id = ?', [req.user.id]);
        res.json({ cart: items.map(item => ({
            id: item.id,
            dishId: item.dish_id,
            quantity: item.quantity || 1,
            name: item.dish_name,
            emoji: item.dish_emoji,
            category: item.dish_category,
            time: item.dish_time
        })) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取购物车失败' });
    }
});

// 添加到购物车
app.post('/api/cart', auth, async (req, res) => {
    const { dishId, name, emoji, category, time, quantity } = req.body;
    if (!dishId) return res.status(400).json({ error: '菜品ID不能为空' });
    try {
        const qty = quantity || 1;
        await pool.query(
            'INSERT INTO cart_items (user_id, dish_id, quantity, dish_name, dish_emoji, dish_category, dish_time) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity), dish_name = VALUES(dish_name)',
            [req.user.id, dishId, qty, name || '', emoji || '🍽️', category || 'home', time || '20分钟']
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '添加失败' });
    }
});

// 从购物车移除
app.delete('/api/cart/:dishId', auth, async (req, res) => {
    try {
        await pool.query('DELETE FROM cart_items WHERE user_id = ? AND dish_id = ?', [req.user.id, req.params.dishId]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '移除失败' });
    }
});

// 清空购物车
app.delete('/api/cart', auth, async (req, res) => {
    try {
        await pool.query('DELETE FROM cart_items WHERE user_id = ?', [req.user.id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '清空失败' });
    }
});

// ==================== 订单 API ====================

// 获取所有订单
app.get('/api/orders', auth, async (req, res) => {
    try {
        const [orders] = await pool.query(
            'SELECT * FROM orders WHERE from_user_id = ? OR to_user_id = ? ORDER BY created_at DESC',
            [req.user.id, req.user.id]
        );
        res.json({ orders: orders.map(o => ({
            id: o.id,
            orderNo: o.order_no,
            fromUserId: o.from_user_id,
            toUserId: o.to_user_id,
            status: o.status,
            orderNote: o.order_note,
            items: JSON.parse(o.items_json || '[]'),
            createdAt: o.created_at,
            time: o.created_at
        })) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取订单失败' });
    }
});

// 下单
app.post('/api/orders', auth, async (req, res) => {
    const { items, note, toUserId } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: '订单不能为空' });

    const orderNo = 'ORD' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase();
    try {
        const [result] = await pool.query(
            'INSERT INTO orders (order_no, from_user_id, to_user_id, status, order_note, items_json) VALUES (?, ?, ?, ?, ?, ?)',
            [orderNo, req.user.id, toUserId || null, 'pending', note || '', JSON.stringify(items)]
        );

        // 清空购物车
        await pool.query('DELETE FROM cart_items WHERE user_id = ?', [req.user.id]);

        // 如果有目标用户，发送通知
        if (toUserId) {
            await pool.query(
                'INSERT INTO order_notifications (user_id, notice_type, order_id) VALUES (?, ?, ?)',
                [toUserId, 'new_order', result.insertId]
            );
        }

        res.json({ order: { id: result.insertId, orderNo, status: 'pending', items, note: note || '', createdAt: new Date().toISOString() } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '下单失败' });
    }
});

// 更新订单状态
app.put('/api/orders/:id/status', auth, async (req, res) => {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: '状态不能为空' });

    try {
        const [rows] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: '订单不存在' });

        const order = rows[0];
        await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);

        // 如果订单完成，通知下单者
        if (status === 'completed') {
            await pool.query(
                'INSERT INTO order_notifications (user_id, notice_type, order_id) VALUES (?, ?, ?)',
                [order.from_user_id, 'completed', req.params.id]
            );
        }

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '更新失败' });
    }
});

// ==================== 通知 API ====================

// 获取未读通知数量
app.get('/api/notifications/count', auth, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT notice_type, COUNT(*) as count FROM order_notifications WHERE user_id = ? AND is_read = 0 GROUP BY notice_type',
            [req.user.id]
        );
        const result = { newOrder: 0, completed: 0, partnerJoined: 0, partnerUnbound: 0 };
        const typeMap = { 'new_order': 'newOrder', 'completed': 'completed', 'partner_joined': 'partnerJoined', 'partner_unbound': 'partnerUnbound' };
        rows.forEach(r => { const key = typeMap[r.notice_type] || r.notice_type; result[key] = r.count; });
        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取通知失败' });
    }
});

// 标记通知为已读
app.put('/api/notifications/read', auth, async (req, res) => {
    const { type } = req.body;
    try {
        if (type) {
            // 规范化类型名：兼容 old camelCase 和 new snake_case
            const typeMap = { 'new_order': 'new_order', 'newOrder': 'new_order', 'partner_joined': 'partner_joined', 'partnerJoined': 'partner_joined', 'partner_unbound': 'partner_unbound', 'partnerUnbound': 'partner_unbound', 'completed': 'completed' };
            const normalizedType = typeMap[type] || type;
            await pool.query('UPDATE order_notifications SET is_read = 1 WHERE user_id = ? AND notice_type = ?', [req.user.id, normalizedType]);
        } else {
            await pool.query('UPDATE order_notifications SET is_read = 1 WHERE user_id = ?', [req.user.id]);
        }
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '更新失败' });
    }
});

// ==================== 邀请码 API ====================

// 创建邀请码
app.post('/api/invitations', auth, async (req, res) => {
    try {
        const code = generateInviteCode();
        // 先清理当前用户的旧邀请码
        await pool.query('DELETE FROM invitations WHERE user_id = ?', [req.user.id]);
        // 插入新邀请码，有效期30分钟
        await pool.query(
            'INSERT INTO invitations (user_id, code, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))',
            [req.user.id, code]
        );
        res.json({ code });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '创建邀请码失败' });
    }
});

// 加入邀请码
app.post('/api/invitations/join', auth, async (req, res) => {
    const { code } = req.body;
    if (!code || code.length !== 6) return res.status(400).json({ error: '请输入6位邀请码' });

    try {
        // 查找邀请码
        const [rows] = await pool.query(
            'SELECT * FROM invitations WHERE code = ? AND expires_at > NOW()',
            [code.toUpperCase()]
        );
        if (rows.length === 0) return res.status(404).json({ error: '邀请码不存在或已过期' });

        const invite = rows[0];
        if (invite.user_id === req.user.id) return res.status(400).json({ error: '不能绑定自己' });

        // 检查是否已经绑定
        const [existing] = await pool.query(
            'SELECT * FROM partners WHERE (user_a_id = ? AND user_b_id = ?) OR (user_a_id = ? AND user_b_id = ?)',
            [req.user.id, invite.user_id, invite.user_id, req.user.id]
        );
        if (existing.length > 0) return res.status(400).json({ error: '已经绑定过了' });

        // 创建绑定关系
        await pool.query(
            'INSERT INTO partners (user_a_id, user_b_id) VALUES (?, ?)',
            [Math.min(req.user.id, invite.user_id), Math.max(req.user.id, invite.user_id)]
        );

        // 删除已使用的邀请码
        await pool.query('DELETE FROM invitations WHERE id = ?', [invite.id]);

        // 获取创建者信息
        const [creator] = await pool.query('SELECT id, nickname, avatar FROM users WHERE id = ?', [invite.user_id]);

        // 发送通知给创建者
        await pool.query(
            'INSERT INTO order_notifications (user_id, notice_type, order_id) VALUES (?, ?, ?)',
            [invite.user_id, 'partner_joined', req.user.id]
        );

        res.json({
            partner: { id: creator[0].id, nickname: creator[0].nickname, avatar: creator[0].avatar }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '加入失败' });
    }
});

// 获取伴侣信息
app.get('/api/partner', auth, async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM partners WHERE user_a_id = ? OR user_b_id = ?',
            [req.user.id, req.user.id]
        );
        if (rows.length === 0) return res.json({ partner: null });

        const partnerRow = rows[0];
        const partnerId = partnerRow.user_a_id === req.user.id ? partnerRow.user_b_id : partnerRow.user_a_id;

        const [users] = await pool.query('SELECT id, nickname, avatar, phone FROM users WHERE id = ?', [partnerId]);
        if (users.length === 0) return res.json({ partner: null });

        res.json({
            partner: {
                id: users[0].id,
                nickname: users[0].nickname,
                avatar: users[0].avatar,
                phone: users[0].phone,
                bindTime: partnerRow.created_at
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '获取伴侣信息失败' });
    }
});

// 解除绑定
app.delete('/api/partner', auth, async (req, res) => {
    try {
        // 找到伴侣，以便通知对方
        const [rows] = await pool.query('SELECT * FROM partners WHERE user_a_id = ? OR user_b_id = ?', [req.user.id, req.user.id]);
        if (rows.length > 0) {
            const p = rows[0];
            const partnerId = p.user_a_id === req.user.id ? p.user_b_id : p.user_a_id;
            // 通知对方关系已解除（order_id 用 0 表示无关联订单）
            await pool.query('INSERT INTO order_notifications (user_id, notice_type, order_id) VALUES (?, ?, ?)', [partnerId, 'partner_unbound', 0]);
        }
        await pool.query('DELETE FROM partners WHERE user_a_id = ? OR user_b_id = ?', [req.user.id, req.user.id]);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '解除绑定失败' });
    }
});

// 生成6位邀请码
function generateInviteCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// ==================== 启动服务器 ====================
app.listen(PORT, () => {
    console.log(`爱心厨房 API 服务已启动: http://localhost:${PORT}`);
});