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
    
    // Refresh user info in case it was updated in mine page
    this.setData({ userInfo });
    this.loadData();
  },

  onPullDownRefresh() {
    this.loadData().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  checkLogin() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({ userInfo });
      this.loadData();
    } else {
      this.login();
    }
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
            this.setData({ notes: res.result.data.list || [] });
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
            this.setData({ todos: res.result.data.list || [] });
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
          wx.cloud.callFunction({
            name: 'notes',
            data: { action: 'delete', data: { id } },
            success: (res) => {
              console.log('Delete note response:', res);
              wx.showToast({ title: '删除成功' });
              this.loadNotes();
            },
            fail: (err) => {
              console.error('Delete note failed:', err);
              wx.showToast({ title: '删除失败', icon: 'none' });
            }
          });
        }
      }
    });
  },

  toggleTodo(e) {
    const item = e.currentTarget.dataset.item;
    const newCompleted = !item.completed;
    wx.cloud.callFunction({
      name: 'todos',
      data: {
        action: 'update',
        data: { id: item._id, completed: newCompleted }
      },
      success: () => this.loadTodos()
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
    wx.cloud.callFunction({
      name: 'todos',
      data: {
        action: 'create',
        data: { content }
      },
      success: res => {
        if (res.result && res.result.code === 0) {
          this.setData({ newTodo: '' });
          this.loadTodos();
        }
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
    const { selectedNotes } = this.data;
    const deletePromises = selectedNotes.map(id => {
      return wx.cloud.callFunction({
        name: 'notes',
        data: {
          action: 'delete',
          data: { id }
        }
      });
    });

    Promise.all(deletePromises).then(() => {
      wx.showToast({ title: '删除成功' });
      this.exitNotesBatchMode();
      this.loadNotes();
    }).catch(() => {
      wx.showToast({ title: '删除失败', icon: 'none' });
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
    const { selectedTodos } = this.data;
    const deletePromises = selectedTodos.map(id => {
      return wx.cloud.callFunction({
        name: 'todos',
        data: {
          action: 'delete',
          data: { id }
        }
      });
    });

    Promise.all(deletePromises).then(() => {
      wx.showToast({ title: '删除成功' });
      this.exitTodosBatchMode();
      this.loadTodos();
    }).catch(() => {
      wx.showToast({ title: '删除失败', icon: 'none' });
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
          wx.cloud.callFunction({
            name: 'todos',
            data: { action: 'delete', data: { id } },
            success: () => {
              wx.showToast({ title: '删除成功' });
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
  }
});
