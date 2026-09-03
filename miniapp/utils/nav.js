/**
 * 页面导航工具
 * 实现 tabBar 般的平移切换效果：
 * - 如果目标页面已在栈中，用 navigateBack 回退（左滑动画）
 * - 如果不在栈中，用 navigateTo 打开（右滑动画）
 * - 避免页面栈过深
 */
function switchTo(url) {
  var pages = getCurrentPages();
  var route = url.replace(/^\//, '').split('?')[0];

  // 从栈顶往下找目标页面
  for (var i = pages.length - 2; i >= 0; i--) {
    if (pages[i].route === route) {
      // 找到了，回退到该页面
      wx.navigateBack({ delta: pages.length - 1 - i });
      return;
    }
  }

  // 没找到，检查栈深度
  if (pages.length >= 4) {
    // 栈太深，先回退到第一个页面再导航
    wx.navigateBack({
      delta: pages.length - 1,
      success: function () {
        setTimeout(function () {
          wx.navigateTo({ url: url });
        }, 100);
      }
    });
  } else {
    wx.navigateTo({ url: url });
  }
}

module.exports = {
  switchTo: switchTo
};
