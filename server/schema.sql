-- 爱心厨房数据库
CREATE DATABASE IF NOT EXISTS love_kitchen DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE love_kitchen;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    phone VARCHAR(20) NOT NULL UNIQUE,
    nickname VARCHAR(50) NOT NULL DEFAULT '小可爱',
    avatar VARCHAR(10) NOT NULL DEFAULT '😊',
    login_type VARCHAR(20) NOT NULL DEFAULT 'phone',
    token VARCHAR(64) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 自定义分类表
CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    cat_key VARCHAR(50) NOT NULL,
    icon VARCHAR(10) NOT NULL DEFAULT '🍽️',
    label VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_user_catkey (user_id, cat_key)
) ENGINE=InnoDB;

-- 自定义菜品表
CREATE TABLE IF NOT EXISTS dishes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL DEFAULT 0,
    name VARCHAR(50) NOT NULL,
    desc_text VARCHAR(100) NOT NULL DEFAULT '',
    emoji VARCHAR(10) NOT NULL DEFAULT '🍽️',
    category VARCHAR(50) NOT NULL DEFAULT 'home',
    time VARCHAR(20) NOT NULL DEFAULT '20分钟',
    is_system TINYINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 购物车表
CREATE TABLE IF NOT EXISTS cart_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    dish_id INT NOT NULL,
    dish_name VARCHAR(50) NOT NULL,
    dish_emoji VARCHAR(10) NOT NULL,
    dish_category VARCHAR(50) NOT NULL,
    dish_time VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_user_dish (user_id, dish_id)
) ENGINE=InnoDB;

-- 订单表
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_no VARCHAR(20) NOT NULL UNIQUE,
    from_user_id INT NOT NULL,
    to_user_id INT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    order_note VARCHAR(200) NOT NULL DEFAULT '',
    items_json TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 订单通知表（记录每个用户的未读通知数）
CREATE TABLE IF NOT EXISTS order_notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    notice_type VARCHAR(20) NOT NULL COMMENT 'new_order / completed',
    order_id INT NOT NULL,
    is_read TINYINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_read (user_id, is_read)
) ENGINE=InnoDB;

-- 邀请码表
CREATE TABLE IF NOT EXISTS invitations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    code VARCHAR(6) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 30 MINUTE),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 情侣绑定表
CREATE TABLE IF NOT EXISTS partners (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_a_id INT NOT NULL,
    user_b_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_a_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (user_b_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_partner_pair (user_a_id, user_b_id)
) ENGINE=InnoDB;

-- 插入系统默认菜品
INSERT INTO dishes (user_id, name, desc_text, emoji, category, time, is_system) VALUES
(0, '红烧排骨', '肥而不腻，入口即化', '🍖', 'home', '30分钟', 1),
(0, '番茄炒蛋', '酸甜可口，家常美味', '🍅', 'home', '10分钟', 1),
(0, '宫保鸡丁', '麻辣鲜香，下饭神器', '🍗', 'home', '15分钟', 1),
(0, '清蒸鲈鱼', '鲜嫩多汁，健康美味', '🐟', 'home', '20分钟', 1),
(0, '回锅肉', '香辣诱人，肥而不腻', '🥩', 'home', '20分钟', 1),
(0, '蒜蓉西兰花', '清爽可口，营养丰富', '🥬', 'home', '10分钟', 1),
(0, '鱼香肉丝', '酸甜微辣，经典川菜', '🍽️', 'home', '15分钟', 1),
(0, '糖醋里脊', '外酥里嫩，酸甜可口', '🍖', 'home', '20分钟', 1),
(0, '酸辣汤', '酸辣开胃，暖心暖胃', '🥣', 'soup', '15分钟', 1),
(0, '番茄牛腩汤', '浓郁鲜美，营养滋补', '🍲', 'soup', '45分钟', 1),
(0, '紫菜蛋花汤', '清淡鲜美，简单快手', '🥣', 'soup', '10分钟', 1),
(0, '排骨莲藕汤', '清甜滋润，暖身养胃', '🍲', 'soup', '60分钟', 1),
(0, '芒果布丁', '香甜滑嫩，入口即化', '🍮', 'dessert', '30分钟', 1),
(0, '红豆沙', '甜而不腻，暖心暖胃', '🍡', 'dessert', '45分钟', 1),
(0, '芒果西米露', '清甜爽口，夏日必备', '🥭', 'dessert', '20分钟', 1),
(0, '双皮奶', '香滑细腻，奶香浓郁', '🍮', 'dessert', '30分钟', 1),
(0, '牛肉面', '汤浓面劲，暖心暖胃', '🍜', 'noodle', '30分钟', 1),
(0, '炸酱面', '酱香浓郁，经典美味', '🍝', 'noodle', '20分钟', 1),
(0, '饺子', '皮薄馅大，家的味道', '🥟', 'noodle', '45分钟', 1),
(0, '葱油拌面', '葱香四溢，简单快手', '🍜', 'noodle', '10分钟', 1);