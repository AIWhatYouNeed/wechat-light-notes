App({
  globalData: {
    openid: null
  },
  
  onLaunch: function () {
    if (wx.cloud) {
      wx.cloud.init({
        env: 'cloud1-7gwqps20ba3b8837',
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
