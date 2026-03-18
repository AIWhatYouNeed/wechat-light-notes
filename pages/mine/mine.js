Page({
  data: {
    userInfo: null,
    showNicknameModal: false,
    newNickname: ''
  },

  onLoad() {
    const userInfo = wx.getStorageSync('userInfo');
    this.setData({ userInfo });
  },

  editNickname() {
    this.setData({
      showNicknameModal: true,
      newNickname: this.data.userInfo.nickName || ''
    });
  },

  closeNicknameModal() {
    this.setData({ showNicknameModal: false });
  },

  onNicknameInput(e) {
    this.setData({ newNickname: e.detail.value });
  },

  saveNickname() {
    const newNickname = this.data.newNickname.trim();
    if (!newNickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }
    if (newNickname.length > 20) {
      wx.showToast({ title: '昵称不能超过20个字符', icon: 'none' });
      return;
    }

    // Update locally
    const userInfo = { ...this.data.userInfo, nickName: newNickname };
    this.setData({ userInfo, showNicknameModal: false });
    wx.setStorageSync('userInfo', userInfo);
    
    // Update in cloud
    wx.cloud.callFunction({
      name: 'updateUser',
      data: { nickName: newNickname },
      success: () => {
        wx.showToast({ title: '昵称已修改' });
      },
      fail: (err) => {
        console.error('Update nickname failed:', err);
      }
    });
  },

  goToRecycleBin() {
    wx.navigateTo({ url: '/pages/recycleBin/recycleBin' });
  },

  onLogout() {
    wx.showModal({
      title: '提示',
      content: '确定退出登录吗？',
      success: res => {
        if (res.confirm) {
          wx.removeStorageSync('userInfo');
          wx.removeStorageSync('sharePassword');
          wx.showToast({
            title: '已退出',
            success: () => {
              setTimeout(() => {
                // Redirect to login page
                wx.reLaunch({ url: '/pages/index/index' });
              }, 500);
            }
          });
        }
      }
    });
  },

  chooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: res => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.uploadAvatar(tempFilePath);
      }
    });
  },

  uploadAvatar(filePath) {
    wx.showLoading({ title: '上传中...' });

    // Upload to cloud storage
    const cloudPath = `avatars/${this.data.userInfo.openid}_${Date.now()}.jpg`;

    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath,
      success: res => {
        const fileID = res.fileID;
        // Update user info locally
        const userInfo = { ...this.data.userInfo, avatarUrl: fileID };
        this.setData({ userInfo });
        wx.setStorageSync('userInfo', userInfo);
        
        // Update in cloud database
        wx.cloud.callFunction({
          name: 'updateUser',
          data: { avatarUrl: fileID },
          success: () => {
            wx.hideLoading();
            wx.showToast({ title: '头像已更新' });
          },
          fail: err => {
            wx.hideLoading();
            console.error('Update avatar failed:', err);
            wx.showToast({ title: '头像已更新' });
          }
        });
      },
      fail: err => {
        wx.hideLoading();
        wx.showToast({ title: '上传失败', icon: 'none' });
        console.error('Upload failed:', err);
      }
    });
  }
});
