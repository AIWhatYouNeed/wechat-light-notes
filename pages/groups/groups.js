Page({
  data: {
    groups: [],
    history: [],
    showCreateModal: false,
    showJoinModal: false,
    showHistory: false,
    groupName: '',
    joinCode: '',
    userOpenid: ''
  },

  onLoad() {
    this.getUserOpenid();
    this.loadGroups();
    this.loadHistory();
  },

  getUserOpenid() {
    const app = getApp();
    if (app.globalData && app.globalData.openid) {
      this.setData({ userOpenid: app.globalData.openid });
    } else {
      wx.cloud.callFunction({
        name: 'login',
        success: res => {
          if (res.result && res.result.code === 0) {
            this.setData({ userOpenid: res.result.data.openid });
            app.globalData.openid = res.result.data.openid;
          }
        }
      });
    }
  },

  onShow() {
    this.loadGroups();
    this.loadHistory();
  },

  loadGroups() {
    wx.cloud.callFunction({
      name: 'groups',
      data: { action: 'list' },
      success: res => {
        if (res.result && res.result.code === 0) {
          this.setData({ groups: res.result.data.list || [] });
        }
      }
    });
  },

  loadHistory() {
    wx.cloud.callFunction({
      name: 'groups',
      data: { action: 'history' },
      success: res => {
        if (res.result && res.result.code === 0) {
          this.setData({ history: res.result.data.list || [] });
        }
      }
    });
  },

  showCreate() {
    this.setData({ showCreateModal: true, groupName: '' });
  },

  showJoin() {
    this.setData({ showJoinModal: true, joinCode: '' });
  },

  closeCreateModal() {
    this.setData({ showCreateModal: false });
  },

  closeJoinModal() {
    this.setData({ showJoinModal: false });
  },

  onGroupNameInput(e) {
    this.setData({ groupName: e.detail.value });
  },

  onJoinCodeInput(e) {
    this.setData({ joinCode: e.detail.value });
  },

  createGroup() {
    const name = this.data.groupName.trim();
    if (!name) {
      wx.showToast({ title: '请输入组名', icon: 'none' });
      return;
    }
    wx.cloud.callFunction({
      name: 'groups',
      data: {
        action: 'create',
        data: { name }
      },
      success: res => {
        if (res.result && res.result.code === 0) {
          wx.showModal({
            title: '创建成功',
            content: `分享码：${res.result.data.code}，请保存好分享给好友`,
            showCancel: false,
            success: () => {
              this.setData({ showCreateModal: false });
              this.loadGroups();
            }
          });
        } else {
          wx.showToast({ title: res.result.message || '创建失败', icon: 'none' });
        }
      }
    });
  },

  joinGroup() {
    const code = this.data.joinCode.trim();
    if (!code) {
      wx.showToast({ title: '请输入分享码', icon: 'none' });
      return;
    }
    wx.cloud.callFunction({
      name: 'groups',
      data: {
        action: 'join',
        data: { code }
      },
      success: res => {
        if (res.result && res.result.code === 0) {
          wx.showToast({ title: '加入成功' });
          this.setData({ showJoinModal: false });
          this.loadGroups();
        } else if (res.result && res.result.code === 1) {
          // Join request sent, waiting for approval
          wx.showModal({
            title: '申请已发送',
            content: '您曾被踢出该群组，需要创建者同意才能重新加入。请等待创建者审核。',
            showCancel: false,
            success: () => {
              this.setData({ showJoinModal: false });
            }
          });
        } else {
          wx.showToast({ title: res.result.message || '加入失败', icon: 'none' });
        }
      }
    });
  },

  goToGroupDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/groupDetail/groupDetail?id=${id}` });
  },

  copyCode(e) {
    const code = e.currentTarget.dataset.code;
    wx.setClipboardData({
      data: code,
      success: () => {
        wx.showToast({ title: '分享码已复制' });
      }
    });
  },

  deleteGroup(e) {
    const groupId = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个共享组吗？删除后所有数据将无法恢复。',
      confirmColor: '#f44336',
      success: res => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'groups',
            data: {
              action: 'delete',
              data: { groupId }
            },
            success: res => {
              if (res.result && res.result.code === 0) {
                wx.showToast({ title: '删除成功' });
                this.loadGroups();
              } else {
                wx.showToast({ title: res.result.message || '删除失败', icon: 'none' });
              }
            },
            fail: () => {
              wx.showToast({ title: '删除失败', icon: 'none' });
            }
          });
        }
      }
    });
  },

  toggleHistory() {
    this.setData({ showHistory: !this.data.showHistory });
  },

    rejoinGroup(e) {
    const groupId = e.currentTarget.dataset.id;
    wx.cloud.callFunction({
      name: 'groups',
      data: {
        action: 'rejoin',
        data: { groupId }
      },
      success: res => {
        if (res.result && res.result.code === 0) {
          wx.showToast({ title: '重新加入成功' });
          this.loadGroups();
          this.loadHistory();
        } else if (res.result && res.result.code === 1) {
          // Join request sent, waiting for approval
          wx.showModal({
            title: '申请已发送',
            content: '您曾被踢出该群组，需要创建者同意才能重新加入。请等待创建者审核。',
            showCancel: false,
            success: () => {
              this.loadHistory();
            }
          });
        } else {
          wx.showToast({ title: res.result.message || '加入失败', icon: 'none' });
        }
      }
    });
  }
});
