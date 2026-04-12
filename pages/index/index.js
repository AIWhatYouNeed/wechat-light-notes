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
    // Check if authenticated first
    const isAuthenticated = wx.getStorageSync('isAuthenticated');
    if (!isAuthenticated) {
      // Not authenticated, go back to auth page
      wx.redirectTo({ url: '/pages/auth/auth' });
      return;
    }
    
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

  onLoginTap() {
    console.log('Login button tapped');
    // Use getUserProfile to get user info (replaces deprecated getUserInfo)
    wx.getUserProfile({
      desc: '用于完善用户资料',
      success: (res) => {
        console.log('getUserProfile success:', res);
        const userInfo = res.userInfo;
        console.log('User info:', userInfo);
        this.doLogin(userInfo);
      },
      fail: (err) => {
        console.error('getUserProfile failed:', err);
        wx.showModal({
          title: '获取失败',
          content: err.errMsg || '无法获取用户信息，请重试',
          showCancel: false
        });
      }
    });
  },

  doLogin(userInfo) {
    wx.showLoading({ title: '登录中...' });
    console.log('doLogin called with:', userInfo);

    // Call cloud function to get openid and save user info
    wx.cloud.callFunction({
      name: 'login',
      data: {
        nickName: userInfo.nickName,
        avatarUrl: userInfo.avatarUrl
      },
      success: res => {
        console.log('Login cloud function result:', res);
        if (res.result && res.result.code === 0) {
          const { openid, userInfo: cloudUserInfo } = res.result.data;
          console.log('Cloud user info:', cloudUserInfo);
          console.log('WeChat user info:', userInfo);
          
          // Check if user has custom settings in cloud
          const hasCloudNickName = cloudUserInfo && cloudUserInfo.nickName && cloudUserInfo.nickName.trim() !== '';
          const hasCloudAvatar = cloudUserInfo && cloudUserInfo.avatarUrl && cloudUserInfo.avatarUrl.trim() !== '';
          
          console.log('Has cloud nickname:', hasCloudNickName, 'Value:', cloudUserInfo?.nickName);
          console.log('Has cloud avatar:', hasCloudAvatar, 'Value:', cloudUserInfo?.avatarUrl);
          
          // Use cloud stored user info if available, otherwise use WeChat info
          const finalNickName = hasCloudNickName ? cloudUserInfo.nickName : (userInfo.nickName || '用户');
          // Always use cloud avatar if available (it's the latest)
          const finalAvatarUrl = hasCloudAvatar ? cloudUserInfo.avatarUrl : (userInfo.avatarUrl || '/static/icon/headPortrait.png');
          
          const fullUserInfo = {
            ...userInfo,
            openid: openid,
            nickName: finalNickName,
            avatarUrl: finalAvatarUrl
          };
          console.log('Final user info to save:', fullUserInfo);
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
