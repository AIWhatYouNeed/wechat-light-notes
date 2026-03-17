Page({
  data: {
    id: '',
    title: '',
    content: '',
    color: '#ffffff',
    isEdit: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ id: options.id, isEdit: true });
      this.loadNote(options.id);
    }
  },

  loadNote(id) {
    wx.cloud.callFunction({
      name: 'notes',
      data: { action: 'get', data: { id } },
      success: res => {
        if (res.result && res.result.code === 0) {
          const note = res.result.data;
          this.setData({
            title: note.title,
            content: note.content,
            color: note.color || '#ffffff'
          });
        }
      }
    });
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value });
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  selectColor(e) {
    const color = e.currentTarget.dataset.color;
    this.setData({ color });
  },

  saveNote() {
    if (!this.data.content.trim()) {
      wx.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }

    const data = {
      title: this.data.title,
      content: this.data.content,
      color: this.data.color
    };

    if (this.data.isEdit) {
      data.id = this.data.id;
    }

    wx.showLoading({ title: '保存中...' });

    wx.cloud.callFunction({
      name: 'notes',
      data: {
        action: this.data.isEdit ? 'update' : 'create',
        data
      },
      success: res => {
        console.log('Cloud function response:', res);
        if (res.result && res.result.code === 0) {
          wx.showToast({ title: '保存成功' });
          setTimeout(() => {
            wx.navigateBack();
          }, 500);
        } else {
          wx.showToast({ title: res.result.message || '保存失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '保存失败', icon: 'none' });
      },
      complete: () => {
        wx.hideLoading();
      }
    });
  }
});
