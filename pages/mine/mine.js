Page({
  data: {
    userInfo: null,
    showNicknameModal: false,
    newNickname: ''
  },

  onLoad() {
    const userInfo = wx.getStorageSync('userInfo');
    this.setData({ userInfo });
    
    // Convert avatar fileID to URL if needed
    if (userInfo && userInfo.avatarUrl && userInfo.avatarUrl.startsWith('cloud://')) {
      this.convertAvatarToUrl(userInfo.avatarUrl);
    }
  },

  // Convert cloud fileID to temporary URL
  convertAvatarToUrl(fileID) {
    wx.cloud.getTempFileURL({
      fileList: [fileID],
      success: res => {
        const tempUrl = res.fileList[0].tempFileURL;
        const userInfo = { ...this.data.userInfo, avatarUrl: tempUrl };
        this.setData({ userInfo });
        // Note: we don't save temp URL to storage, keep fileID there
      },
      fail: err => {
        console.error('Convert avatar to URL failed:', err);
      }
    });
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
    console.log('Saving nickname to cloud:', newNickname);
    wx.cloud.callFunction({
      name: 'updateUser',
      data: { nickName: newNickname },
      success: (res) => {
        console.log('Update nickname result:', res);
        if (res.result && res.result.code === 0) {
          wx.showToast({ title: '昵称已修改' });
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' });
          console.error('Update nickname failed:', res.result);
        }
      },
      fail: (err) => {
        wx.showToast({ title: '保存失败', icon: 'none' });
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
          // Only remove local session, keep user data in cloud
          wx.removeStorageSync('userInfo');
          wx.removeStorageSync('sharePassword');
          // Note: We don't clear isAuthenticated here so user can re-login easily
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
        
        // Save fileID to database (permanent), not temp URL
        // Update local storage with fileID
        const userInfoWithFileID = { ...this.data.userInfo, avatarUrl: fileID };
        wx.setStorageSync('userInfo', userInfoWithFileID);
        
        // Convert to temp URL for immediate display
        wx.cloud.getTempFileURL({
          fileList: [fileID],
          success: urlRes => {
            const tempUrl = urlRes.fileList[0].tempFileURL;
            const userInfoWithUrl = { ...this.data.userInfo, avatarUrl: tempUrl };
            this.setData({ userInfo: userInfoWithUrl });
            wx.hideLoading();
            wx.showToast({ title: '头像已更新' });
          },
          fail: err => {
            wx.hideLoading();
            console.error('Get temp URL failed:', err);
            wx.showToast({ title: '头像已更新' });
          }
        });
        
        // Update in cloud database - save fileID (permanent)
        wx.cloud.callFunction({
          name: 'updateUser',
          data: { avatarUrl: fileID },
          success: () => {
            console.log('Avatar fileID saved to database');
          },
          fail: err => {
            console.error('Update avatar failed:', err);
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
