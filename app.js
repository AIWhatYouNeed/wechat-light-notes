App({
  globalData: {
    openid: null
  },
  
  onLaunch: function () {
    if (wx.cloud) {
      wx.cloud.init({
        env: 'YOUR_CLOUD_ENV_ID_HERE',
        traceUser: true
      });
      console.log('Cloud initialized');
      this.getOpenid();
    } else {
      console.error('Cloud development is not available');
    }
  },

  getOpenid() {
    wx.cloud.callFunction({
      name: 'login',
      success: res => {
        if (res.result && res.result.code === 0) {
          this.globalData.openid = res.result.data.openid;
          console.log('Openid obtained:', this.globalData.openid);
        }
      }
    });
  },
  onShow: function () {
    console.log('App Show');
  },
  onHide: function () {
    console.log('App Hide');
  }
});
