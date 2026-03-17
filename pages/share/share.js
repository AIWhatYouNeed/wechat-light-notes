Page({
  data: {
    password: '',
    verified: false,
    sharedNotes: [],
    loading: false
  },

  onLoad() {
    const savedPassword = wx.getStorageSync('sharePassword');
    if (savedPassword) {
      this.setData({ password: savedPassword });
      this.verifyPassword();
    }
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  verifyPassword() {
    if (!this.data.password.trim()) {
      wx.showToast({ title: '请输入分享密码', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    wx.cloud.callFunction({
      name: 'verifySharePassword',
      data: { password: this.data.password.trim() },
      success: res => {
        if (res.result && res.result.code === 0) {
          this.setData({
            sharedNotes: res.result.data.notes,
            verified: true
          });
          wx.setStorageSync('sharePassword', this.data.password);
        } else {
          wx.showToast({ title: '密码错误或没有共享的小记', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '验证失败', icon: 'none' });
      },
      complete: () => {
        this.setData({ loading: false });
      }
    });
  },

  changePassword() {
    wx.removeStorageSync('sharePassword');
    this.setData({
      password: '',
      verified: false,
      sharedNotes: []
    });
  }
});
