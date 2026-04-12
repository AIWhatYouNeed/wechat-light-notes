const app = getApp();

Page({
  data: {
    userInfo: null,
    notes: [],
    todos: [],
    newTodo: '',
    shareShow: false,
    sharePassword: '',
    currentShareNote: null,
    currentShareIndex: -1,
    todoEditShow: false,
    editTodoContent: '',
    currentEditTodo: null,
    notesCollapsed: false,
    todosCollapsed: false,
    notesBatchMode: false,
    todosBatchMode: false,
    selectedNotes: [],
    selectedTodos: []
  },

  onLoad() {
    this.checkAuth();
    this.checkLogin();
  },

  checkAuth() {
    const isAuthenticated = wx.getStorageSync('isAuthenticated');
    if (!isAuthenticated) {
      wx.redirectTo({ url: '/pages/auth/auth' });
      return false;
    }
    return true;
  },

  onShow() {
    // Check login status first
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo || !userInfo.openid) {
      // Not logged in, redirect to login page
      wx.redirectTo({
        url: '/pages/index/index'
      });
      return;
    }
    
    // Refresh user info from cloud to get latest avatar
    this.refreshUserInfo();
    this.loadData();
  },

  // Refresh user info from cloud database
  refreshUserInfo() {
    const localUserInfo = wx.getStorageSync('userInfo');
    
    wx.cloud.callFunction({
      name: 'login',
      success: res => {
        if (res.result && res.result.code === 0) {
          const cloudUserInfo = res.result.data.userInfo;
          
          // Merge cloud data with local (keep openid)
          const updatedUserInfo = {
            ...localUserInfo,
            nickName: cloudUserInfo.nickName || localUserInfo.nickName,
            avatarUrl: cloudUserInfo.avatarUrl || localUserInfo.avatarUrl
          };
          
          // Save cloud avatar to storage (fileID)
          wx.setStorageSync('userInfo', updatedUserInfo);
          
          // Convert to temp URL for display
          if (updatedUserInfo.avatarUrl && updatedUserInfo.avatarUrl.startsWith('cloud://')) {
            this.convertAvatarToUrl(updatedUserInfo.avatarUrl, updatedUserInfo);
          } else {
            this.setData({ userInfo: updatedUserInfo });
          }
        }
      },
      fail: () => {
        // Fallback to local data
        if (localUserInfo.avatarUrl && localUserInfo.avatarUrl.startsWith('cloud://')) {
          this.convertAvatarToUrl(localUserInfo.avatarUrl, localUserInfo);
        } else {
          this.setData({ userInfo: localUserInfo });
        }
      }
    });
  },

  onPullDownRefresh() {
    this.loadData().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  checkLogin() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      // Convert cloud fileID to temp URL if needed
      if (userInfo.avatarUrl && userInfo.avatarUrl.startsWith('cloud://')) {
        this.convertAvatarToUrl(userInfo.avatarUrl, userInfo);
      } else {
        this.setData({ userInfo });
      }
      this.loadData();
    } else {
      this.login();
    }
  },

  // Convert cloud fileID to temporary URL
  convertAvatarToUrl(fileID, userInfo) {
    wx.cloud.getTempFileURL({
      fileList: [fileID],
      success: res => {
        const tempUrl = res.fileList[0].tempFileURL;
        const updatedUserInfo = { ...userInfo, avatarUrl: tempUrl };
        this.setData({ userInfo: updatedUserInfo });
      },
      fail: err => {
        console.error('Convert avatar to URL failed:', err);
        this.setData({ userInfo });
      }
    });
  },

  login() {
    wx.showLoading({ title: '登录中...' });
    wx.cloud.callFunction({
      name: 'login',
      success: res => {
        if (res.result && res.result.code === 0) {
          const userInfo = res.result.data;
          wx.setStorageSync('userInfo', userInfo);
          this.setData({ userInfo });
          this.loadData();
        }
      },
      fail: err => {
        console.error('Login failed:', err);
        wx.showToast({ title: '登录失败', icon: 'none' });
      },
      complete: () => {
        wx.hideLoading();
      }
    });
  },

  async loadData() {
    await Promise.all([this.loadNotes(), this.loadTodos()]);
  },

  loadNotes() {
    return new Promise((resolve) => {
      wx.cloud.callFunction({
        name: 'notes',
        data: { action: 'list' },
        success: res => {
          console.log('Load notes response:', res);
          if (res.result && res.result.code === 0) {
            console.log('Notes list:', res.result.data.list);
            const notes = (res.result.data.list || []).map(note => ({
              ...note,
              contentSegments: this.parseSegments(note.content)
            }));
            this.setData({ notes });
          }
          resolve();
        },
        fail: (err) => {
          console.error('Load notes failed:', err);
          resolve();
        }
      });
    });
  },

  loadTodos() {
    return new Promise((resolve) => {
      wx.cloud.callFunction({
        name: 'todos',
        data: { action: 'list' },
        success: res => {
          if (res.result && res.result.code === 0) {
            const todos = (res.result.data.list || []).map(todo => ({
              ...todo,
              contentSegments: this.parseSegments(todo.content)
            }));
            this.setData({ todos });
          }
          resolve();
        },
        fail: () => resolve()
      });
    });
  },

  onAddNote() {
    wx.navigateTo({ url: '/pages/addNote/addNote' });
  },

  onEditNote(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/addNote/addNote?id=${id}` });
  },

  onDeleteNote(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '提示',
      content: '确定删除这条小记吗？',
      success: res => {
        if (res.confirm) {
          // Remove from local state immediately
          const notes = this.data.notes.filter(item => item._id !== id);
          this.setData({ notes });
          wx.showToast({ title: '删除成功' });
          
          // Sync with server in background
          wx.cloud.callFunction({
            name: 'notes',
            data: { action: 'delete', data: { id } },
            fail: (err) => {
              console.error('Delete note failed:', err);
              wx.showToast({ title: '删除失败', icon: 'none' });
              this.loadNotes();
            }
          });
        }
      }
    });
  },

  toggleTodo(e) {
    const item = e.currentTarget.dataset.item;
    const newCompleted = !item.completed;
    
    // Update local state immediately for better UX
    const todos = this.data.todos.map(todo => {
      if (todo._id === item._id) {
        return { ...todo, completed: newCompleted };
      }
      return todo;
    });
    this.setData({ todos });
    
    // Sync with server in background
    wx.cloud.callFunction({
      name: 'todos',
      data: {
        action: 'update',
        data: { id: item._id, completed: newCompleted }
      },
      fail: () => {
        // Revert on failure
        wx.showToast({ title: '更新失败', icon: 'none' });
        this.loadTodos();
      }
    });
  },

  onTodoInput(e) {
    this.setData({ newTodo: e.detail.value });
  },

  addTodo() {
    const content = this.data.newTodo.trim();
    if (!content) {
      wx.showToast({ title: '请输入待办内容', icon: 'none' });
      return;
    }
    
    // Create temp todo for immediate UI update
    const tempId = 'temp_' + Date.now();
    const now = new Date();
    const tempTodo = {
      _id: tempId,
      content: content,
      completed: false,
      createTime: now,
      createTimeStr: this.formatDateTime(now),
      isTemp: true
    };
    
    // Add to local state immediately
    const todos = [tempTodo, ...this.data.todos];
    this.setData({ todos, newTodo: '' });
    
    // Sync with server in background
    wx.cloud.callFunction({
      name: 'todos',
      data: {
        action: 'create',
        data: { content }
      },
      success: res => {
        if (res.result && res.result.code === 0) {
          // Replace temp todo with real one from server
          this.loadTodos();
        }
      },
      fail: () => {
        // Remove temp todo on failure
        const todos = this.data.todos.filter(t => t._id !== tempId);
        this.setData({ todos });
        wx.showToast({ title: '添加失败', icon: 'none' });
      }
    });
  },

  toggleShare(e) {
    const item = e.currentTarget.dataset.item;
    const index = e.currentTarget.dataset.index;
    if (item.shared) {
      this.unshareNote(item, index);
    } else {
      this.setData({
        currentShareNote: item,
        currentShareIndex: index,
        sharePassword: '',
        shareShow: true
      });
    }
  },

  onSharePasswordInput(e) {
    this.setData({ sharePassword: e.detail.value });
  },

  closeShareModal() {
    this.setData({ shareShow: false });
  },

  confirmShare() {
    if (!this.data.sharePassword.trim()) {
      wx.showToast({ title: '请输入分享密码', icon: 'none' });
      return;
    }
    wx.cloud.callFunction({
      name: 'notes',
      data: {
        action: 'share',
        data: {
          id: this.data.currentShareNote._id,
          sharePassword: this.data.sharePassword.trim()
        }
      },
      success: res => {
        if (res.result && res.result.code === 0) {
          wx.showToast({ title: '分享成功' });
          this.loadNotes();
        }
        this.setData({ shareShow: false });
      }
    });
  },

  unshareNote(item, index) {
    wx.showModal({
      title: '提示',
      content: '确定取消分享吗？',
      success: res => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'notes',
            data: { action: 'unshare', data: { id: item._id } },
            success: () => {
              wx.showToast({ title: '已取消分享' });
              this.loadNotes();
            }
          });
        }
      }
    });
  },

  goToMine() {
    wx.navigateTo({ url: '/pages/mine/mine' });
  },

  goToShare() {
    wx.navigateTo({ url: '/pages/share/share' });
  },

  goToGroups() {
    wx.navigateTo({ url: '/pages/groups/groups' });
  },

  // Parse text into segments (text and links)
  parseSegments(text) {
    if (!text) return [{ type: 'text', content: '' }];
    
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    const segments = [];
    let lastIndex = 0;
    let match;
    
    while ((match = urlPattern.exec(text)) !== null) {
      // Add text before link
      if (match.index > lastIndex) {
        segments.push({
          type: 'text',
          content: text.substring(lastIndex, match.index)
        });
      }
      // Add link
      segments.push({
        type: 'link',
        content: match[0]
      });
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (lastIndex < text.length) {
      segments.push({
        type: 'text',
        content: text.substring(lastIndex)
      });
    }
    
    return segments.length > 0 ? segments : [{ type: 'text', content: text }];
  },

  // Open link directly
  openLink(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    
    wx.showActionSheet({
      itemList: ['打开链接', '复制链接'],
      success: res => {
        if (res.tapIndex === 0) {
          wx.navigateTo({
            url: `/pages/webview/webview?url=${encodeURIComponent(url)}`
          });
        } else if (res.tapIndex === 1) {
          wx.setClipboardData({
            data: url,
            success: () => wx.showToast({ title: '已复制' })
          });
        }
      }
    });
  },

  toggleNotes() {
    this.setData({ notesCollapsed: !this.data.notesCollapsed });
  },

  toggleTodos() {
    this.setData({ todosCollapsed: !this.data.todosCollapsed });
  },

  // Batch delete methods for Notes
  enterNotesBatchMode() {
    this.setData({
      notesBatchMode: true,
      selectedNotes: []
    });
  },

  exitNotesBatchMode() {
    const notes = this.data.notes.map(item => ({ ...item, selected: false }));
    this.setData({
      notesBatchMode: false,
      selectedNotes: [],
      notes
    });
  },

  toggleNoteSelect(e) {
    const id = e.currentTarget.dataset.id;
    const notes = this.data.notes.map(item => {
      if (item._id === id) {
        return { ...item, selected: !item.selected };
      }
      return item;
    });
    const selectedNotes = notes.filter(item => item.selected).map(item => item._id);
    this.setData({ notes, selectedNotes });
  },

  selectAllNotes() {
    const notes = this.data.notes.map(item => ({ ...item, selected: true }));
    const selectedNotes = notes.map(item => item._id);
    this.setData({ notes, selectedNotes });
  },

  batchDeleteNotes() {
    const { selectedNotes } = this.data;
    if (selectedNotes.length === 0) {
      wx.showToast({ title: '请先选择项目', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '确认删除',
      content: `确定删除选中的 ${selectedNotes.length} 项吗？`,
      success: res => {
        if (res.confirm) {
          this.performNotesBatchDelete();
        }
      }
    });
  },

  performNotesBatchDelete() {
    const { selectedNotes, notes } = this.data;
    
    // Remove selected items from local state immediately
    const remainingNotes = notes.filter(item => !selectedNotes.includes(item._id));
    this.setData({ notes: remainingNotes });
    wx.showToast({ title: '删除成功' });
    this.exitNotesBatchMode();
    
    // Sync with server in background
    const deletePromises = selectedNotes.map(id => {
      return wx.cloud.callFunction({
        name: 'notes',
        data: {
          action: 'delete',
          data: { id }
        }
      });
    });

    Promise.all(deletePromises).catch(() => {
      wx.showToast({ title: '部分删除失败', icon: 'none' });
      this.loadNotes();
    });
  },

  // Batch delete methods for Todos
  enterTodosBatchMode() {
    this.setData({
      todosBatchMode: true,
      selectedTodos: []
    });
  },

  exitTodosBatchMode() {
    const todos = this.data.todos.map(item => ({ ...item, selected: false }));
    this.setData({
      todosBatchMode: false,
      selectedTodos: [],
      todos
    });
  },

  toggleTodoSelect(e) {
    const id = e.currentTarget.dataset.id;
    const todos = this.data.todos.map(item => {
      if (item._id === id) {
        return { ...item, selected: !item.selected };
      }
      return item;
    });
    const selectedTodos = todos.filter(item => item.selected).map(item => item._id);
    this.setData({ todos, selectedTodos });
  },

  selectAllTodos() {
    const todos = this.data.todos.map(item => ({ ...item, selected: true }));
    const selectedTodos = todos.map(item => item._id);
    this.setData({ todos, selectedTodos });
  },

  batchDeleteTodos() {
    const { selectedTodos } = this.data;
    if (selectedTodos.length === 0) {
      wx.showToast({ title: '请先选择项目', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '确认删除',
      content: `确定删除选中的 ${selectedTodos.length} 项吗？`,
      success: res => {
        if (res.confirm) {
          this.performTodosBatchDelete();
        }
      }
    });
  },

  performTodosBatchDelete() {
    const { selectedTodos, todos } = this.data;
    
    // Remove selected items from local state immediately
    const remainingTodos = todos.filter(item => !selectedTodos.includes(item._id));
    this.setData({ todos: remainingTodos });
    wx.showToast({ title: '删除成功' });
    this.exitTodosBatchMode();
    
    // Sync with server in background
    const deletePromises = selectedTodos.map(id => {
      return wx.cloud.callFunction({
        name: 'todos',
        data: {
          action: 'delete',
          data: { id }
        }
      });
    });

    Promise.all(deletePromises).catch(() => {
      wx.showToast({ title: '部分删除失败', icon: 'none' });
      this.loadTodos();
    });
  },

  stopPropagation() {
    // 阻止事件冒泡
  },

  deleteTodo(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '提示',
      content: '确定删除这条待办吗？',
      success: res => {
        if (res.confirm) {
          // Remove from local state immediately
          const todos = this.data.todos.filter(item => item._id !== id);
          this.setData({ todos });
          wx.showToast({ title: '删除成功' });
          
          // Sync with server in background
          wx.cloud.callFunction({
            name: 'todos',
            data: { action: 'delete', data: { id } },
            fail: () => {
              wx.showToast({ title: '删除失败', icon: 'none' });
              this.loadTodos();
            }
          });
        }
      }
    });
  },

  editTodo(e) {
    const item = e.currentTarget.dataset.item;
    this.setData({
      currentEditTodo: item,
      editTodoContent: item.content,
      todoEditShow: true
    });
  },

  onEditTodoInput(e) {
    this.setData({ editTodoContent: e.detail.value });
  },

  closeTodoEditModal() {
    this.setData({ todoEditShow: false });
  },

  confirmEditTodo() {
    const content = this.data.editTodoContent.trim();
    if (!content) {
      wx.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }
    wx.cloud.callFunction({
      name: 'todos',
      data: {
        action: 'update',
        data: {
          id: this.data.currentEditTodo._id,
          content: content
        }
      },
      success: res => {
        if (res.result && res.result.code === 0) {
          wx.showToast({ title: '修改成功' });
          this.loadTodos();
        }
        this.setData({ todoEditShow: false });
      }
    });
  },

  // Helper function to format date time
  formatDateTime(date) {
    const chinaTime = new Date(date.getTime() + (8 * 60 * 60 * 1000));
    const month = (chinaTime.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = chinaTime.getUTCDate().toString().padStart(2, '0');
    const hours = chinaTime.getUTCHours().toString().padStart(2, '0');
    const minutes = chinaTime.getUTCMinutes().toString().padStart(2, '0');
    return `${month}-${day} ${hours}:${minutes}`;
  },

  // Handle avatar load error (e.g., expired temp URL)
  onAvatarError() {
    console.log('Avatar load error, trying to refresh...');
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo && userInfo.avatarUrl && userInfo.avatarUrl.startsWith('cloud://')) {
      // Try to get fresh temp URL
      this.convertAvatarToUrl(userInfo.avatarUrl, userInfo);
    } else {
      // Fallback to default avatar
      const updatedUserInfo = { ...this.data.userInfo, avatarUrl: '/static/icon/headPortrait.png' };
      this.setData({ userInfo: updatedUserInfo });
    }
  }
});
