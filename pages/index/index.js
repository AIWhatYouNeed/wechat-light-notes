Page({
  data: {
    animationClass: ''
  },

  onLoad() {
    setTimeout(() => {
      this.setData({ animationClass: 'fade-in' });
    }, 100);

    setTimeout(() => {
      this.navigateToHome();
    }, 2000);
  },

  navigateToHome() {
    wx.redirectTo({
      url: '/pages/home/home'
    });
  },

  onEnter() {
    this.navigateToHome();
  }
});
