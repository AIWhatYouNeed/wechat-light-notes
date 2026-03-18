Page({
  data: {
    animationClass: '',
    isLoggedIn: false,
    isLoading: false
  },

  onLoad() {
    setTimeout(() => {
      this.setData({ animationClass: 'fade-in' });
    }, 100);

    // Check login status
    this.checkLoginStatus();
  },

  onShow() {
    // Re-check login status when page shows
    this.checkLoginStatus();
  },

  checkLoginStatus() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo && userInfo.openid) {
      // Already logged in, go to home directly
      this.setData({ isLoggedIn: true, isLoading: true });
      setTimeout(() => {
        this.navigateToHome();
      }, 1000);
    } else {
      this.setData({ isLoggedIn: false, isLoading: false });
    }
  },

  onGetUserInfo(e) {
    if (e.detail.errMsg === 'getUserInfo:ok') {
      // User authorized, get user info and login
      const userInfo = e.detail.userInfo;
      this.doLogin(userInfo);
    } else {
      wx.showToast({
        title: '需要授权才能登录',
        icon: 'none'
      });
    }
  },

  doLogin(userInfo) {
    wx.showLoading({ title: '登录中...' });

    // Call cloud function to get openid and save user info
    wx.cloud.callFunction({
      name: 'login',
      data: {
        nickName: userInfo.nickName,
        avatarUrl: userInfo.avatarUrl
      },
      success: res => {
        if (res.result && res.result.code === 0) {
          const { openid, userInfo: cloudUserInfo } = res.result.data;
          
          // Merge with cloud stored user info (prioritize cloud data for nickname/avatar)
          const fullUserInfo = {
            ...userInfo,
            openid: openid,
            // Use cloud stored nickname/avatar if available, otherwise use WeChat info
            nickName: (cloudUserInfo && cloudUserInfo.nickName) ? cloudUserInfo.nickName : userInfo.nickName,
            avatarUrl: (cloudUserInfo && cloudUserInfo.avatarUrl) ? cloudUserInfo.avatarUrl : (userInfo.avatarUrl || '/static/icon/headPortrait.png')
          };
          wx.setStorageSync('userInfo', fullUserInfo);
          
          wx.hideLoading();
          wx.showToast({ 
            title: '登录成功',
            success: () => {
              // Directly navigate to home after login
              setTimeout(() => {
                this.navigateToHome();
              }, 500);
            }
          });
        } else {
          wx.hideLoading();
          wx.showToast({ title: '登录失败', icon: 'none' });
        }
      },
      fail: err => {
        wx.hideLoading();
        wx.showToast({ title: '登录失败', icon: 'none' });
        console.error('Login failed:', err);
      }
    });
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
