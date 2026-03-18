const app = getApp();
const RETENTION_DAYS = 15;

Page({
  data: {
    activeTab: 'personal',
    personalNotes: [],
    personalTodos: [],
    sharedNotes: [],
    sharedTodos: [],
    clearing: false
  },

  onLoad() {
    this.checkAuth();
    this.loadRecycleBin();
  },

  onShow() {
    this.loadRecycleBin();
  },

  checkAuth() {
    const isAuthenticated = wx.getStorageSync('isAuthenticated');
    if (!isAuthenticated) {
      wx.redirectTo({ url: '/pages/auth/auth' });
      return false;
    }
    return true;
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
  },

  loadRecycleBin() {
    wx.showLoading({ title: '加载中...' });

    wx.cloud.callFunction({
      name: 'recycleBin',
      data: {
        action: 'list'
      },
      success: res => {
        console.log('Recycle bin response:', res);
        if (res.result && res.result.code === 0) {
          const data = res.result.data;
          console.log('Recycle bin data:', data);
          // Data already processed by cloud function
          this.setData({
            personalNotes: data.personalNotes || [],
            personalTodos: data.personalTodos || [],
            sharedNotes: data.sharedNotes || [],
            sharedTodos: data.sharedTodos || []
          });
        } else {
          console.error('Recycle bin error:', res.result);
        }
      },
      fail: err => {
        console.error('Recycle bin fail:', err);
      },
      complete: () => {
        wx.hideLoading();
      }
    });
  },



  // Restore personal note
  restorePersonalNote(e) {
    const id = e.currentTarget.dataset.id;
    this.restoreItem('restorePersonalNote', id, '个人小记');
  },

  // Restore personal todo
  restorePersonalTodo(e) {
    const id = e.currentTarget.dataset.id;
    this.restoreItem('restorePersonalTodo', id, '个人待办');
  },

  // Restore shared note
  restoreSharedNote(e) {
    const id = e.currentTarget.dataset.id;
    this.restoreItem('restoreSharedNote', id, '共享小记');
  },

  // Restore shared todo
  restoreSharedTodo(e) {
    const id = e.currentTarget.dataset.id;
    this.restoreItem('restoreSharedTodo', id, '共享待办');
  },

  restoreItem(action, id, typeName) {
    wx.showModal({
      title: '确认恢复',
      content: `确定要恢复这条${typeName}吗？`,
      success: res => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'recycleBin',
            data: {
              action: action,
              data: { id }
            },
            success: res => {
              if (res.result && res.result.code === 0) {
                wx.showToast({ title: '恢复成功' });
                this.loadRecycleBin();
              } else {
                wx.showToast({ title: res.result.message || '恢复失败', icon: 'none' });
              }
            }
          });
        }
      }
    });
  },

  // Permanent delete personal note
  permanentDeletePersonalNote(e) {
    const id = e.currentTarget.dataset.id;
    this.permanentDelete('permanentDeletePersonalNote', id, '个人小记');
  },

  // Permanent delete personal todo
  permanentDeletePersonalTodo(e) {
    const id = e.currentTarget.dataset.id;
    this.permanentDelete('permanentDeletePersonalTodo', id, '个人待办');
  },

  // Permanent delete shared note
  permanentDeleteSharedNote(e) {
    const id = e.currentTarget.dataset.id;
    this.permanentDelete('permanentDeleteSharedNote', id, '共享小记');
  },

  // Permanent delete shared todo
  permanentDeleteSharedTodo(e) {
    const id = e.currentTarget.dataset.id;
    this.permanentDelete('permanentDeleteSharedTodo', id, '共享待办');
  },

  permanentDelete(action, id, typeName) {
    wx.showModal({
      title: '确认删除',
      content: `确定要彻底删除这条${typeName}吗？此操作不可恢复！`,
      confirmColor: '#f44336',
      success: res => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'recycleBin',
            data: {
              action: action,
              data: { id }
            },
            success: res => {
              if (res.result && res.result.code === 0) {
                wx.showToast({ title: '已彻底删除' });
                this.loadRecycleBin();
              } else {
                wx.showToast({ title: res.result.message || '删除失败', icon: 'none' });
              }
            }
          });
        }
      }
    });
  },

  // Clear personal expired items
  clearPersonalExpired() {
    wx.showModal({
      title: '清理过期项目',
      content: '确定要清理个人回收站中已过期的项目吗？',
      success: res => {
        if (res.confirm) {
          this.setData({ clearing: true });
          wx.cloud.callFunction({
            name: 'recycleBin',
            data: {
              action: 'clearPersonalExpired'
            },
            success: res => {
              if (res.result && res.result.code === 0) {
                const count = res.result.data.deletedCount;
                wx.showToast({ title: `已清理 ${count} 个项目` });
                this.loadRecycleBin();
              } else {
                wx.showToast({ title: res.result.message || '清理失败', icon: 'none' });
              }
            },
            complete: () => {
              this.setData({ clearing: false });
            }
          });
        }
      }
    });
  },

  // Clear shared expired items
  clearSharedExpired() {
    wx.showModal({
      title: '清理过期项目',
      content: '确定要清理共享回收站中已过期的项目吗？',
      success: res => {
        if (res.confirm) {
          this.setData({ clearing: true });
          wx.cloud.callFunction({
            name: 'recycleBin',
            data: {
              action: 'clearSharedExpired'
            },
            success: res => {
              if (res.result && res.result.code === 0) {
                const count = res.result.data.deletedCount;
                wx.showToast({ title: `已清理 ${count} 个项目` });
                this.loadRecycleBin();
              } else {
                wx.showToast({ title: res.result.message || '清理失败', icon: 'none' });
              }
            },
            complete: () => {
              this.setData({ clearing: false });
            }
          });
        }
      }
    });
  },

  // Clear all personal items
  clearAllPersonal() {
    wx.showModal({
      title: '清空个人回收站',
      content: '确定要清空个人回收站吗？所有个人项目将被彻底删除，此操作不可恢复！',
      confirmColor: '#f44336',
      success: res => {
        if (res.confirm) {
          this.setData({ clearing: true });
          wx.cloud.callFunction({
            name: 'recycleBin',
            data: {
              action: 'clearAllPersonal'
            },
            success: res => {
              if (res.result && res.result.code === 0) {
                const count = res.result.data.deletedCount;
                wx.showToast({ title: `已清空 ${count} 个项目` });
                this.loadRecycleBin();
              } else {
                wx.showToast({ title: res.result.message || '清空失败', icon: 'none' });
              }
            },
            complete: () => {
              this.setData({ clearing: false });
            }
          });
        }
      }
    });
  },

  // Clear all shared items
  clearAllShared() {
    wx.showModal({
      title: '清空共享回收站',
      content: '确定要清空共享回收站吗？所有共享项目将被彻底删除，此操作不可恢复！',
      confirmColor: '#f44336',
      success: res => {
        if (res.confirm) {
          this.setData({ clearing: true });
          wx.cloud.callFunction({
            name: 'recycleBin',
            data: {
              action: 'clearAllShared'
            },
            success: res => {
              if (res.result && res.result.code === 0) {
                const count = res.result.data.deletedCount;
                wx.showToast({ title: `已清空 ${count} 个项目` });
                this.loadRecycleBin();
              } else {
                wx.showToast({ title: res.result.message || '清空失败', icon: 'none' });
              }
            },
            complete: () => {
              this.setData({ clearing: false });
            }
          });
        }
      }
    });
  }
});
