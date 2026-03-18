Page({
  data: {
    password: '',
    loading: false
  },

  onLoad() {
    // Check if already authenticated
    const isAuthenticated = wx.getStorageSync('isAuthenticated');
    if (isAuthenticated) {
      // Already authenticated, go to index
      wx.redirectTo({ url: '/pages/index/index' });
    }
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  verifyPassword() {
    const password = this.data.password.trim();
    
    if (!password) {
      wx.showToast({ title: '请输入密码', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    // Call cloud function to verify password
    wx.cloud.callFunction({
      name: 'auth',
      data: {
        password: password
      },
      success: res => {
        if (res.result && res.result.code === 0) {
          // Authentication successful
          wx.setStorageSync('isAuthenticated', true);
          wx.showToast({ 
            title: '验证成功',
            success: () => {
              setTimeout(() => {
                wx.redirectTo({ url: '/pages/index/index' });
              }, 500);
            }
          });
        } else {
          wx.showToast({ 
            title: res.result.message || '密码错误', 
            icon: 'none' 
          });
        }
      },
      fail: () => {
        wx.showToast({ title: '验证失败，请重试', icon: 'none' });
      },
      complete: () => {
        this.setData({ loading: false });
    }
    });
  }
});
