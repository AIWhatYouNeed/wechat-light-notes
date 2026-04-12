Page({
  data: {
    groupId: '',
    groupInfo: null,
    notes: [],
    todos: [],
    showAddModal: false,
    showEditModal: false,
    showMembers: false,
    noteTitle: '',
    noteContent: '',
    currentEditNote: null,
    colors: ['#ffffff', '#fff9c4', '#c8e6c9', '#bbdefb', '#f8bbd9', '#d7ccc8'],
    selectedColor: '#ffffff',
    // Todos
    newTodo: '',
    notesCollapsed: false,
    todosCollapsed: false,
    notesBatchMode: false,
    todosBatchMode: false,
    selectedNotes: [],
    selectedTodos: [],
    // Todo edit
    showTodoEditModal: false,
    editTodoContent: '',
    currentEditTodo: null,
    // History
    showHistoryModal: false,
    currentHistory: [],
    currentHistoryType: 'note',
    // Preview
    showPreviewModal: false,
    previewData: {},
    previewType: 'note',
    // Join requests
    joinRequests: [],
    showJoinRequests: false
  },

  onLoad(options) {
    const groupId = options.id;
    this.setData({ groupId });
    this.loadGroupInfo(() => {
      // Load join requests after group info is loaded (to check isCreator)
      this.loadJoinRequests();
    });
    this.loadGroupNotes();
    this.loadGroupTodos();
  },

  onShow() {
    if (this.data.groupId) {
      this.loadGroupNotes();
      this.loadGroupTodos();
      // Only load join requests if we already know user is creator
      if (this.data.isCreator) {
        this.loadJoinRequests();
      }
    }
  },

  loadGroupInfo(callback) {
    // Get openid from storage
    const userInfo = wx.getStorageSync('userInfo');
    const userOpenid = userInfo ? userInfo.openid : null;
    
    wx.cloud.callFunction({
      name: 'groups',
      data: {
        action: 'get',
        data: { id: this.data.groupId }
      },
      success: res => {
        if (res.result && res.result.code === 0) {
          const groupInfo = res.result.data;
          const isCreator = groupInfo.creator === userOpenid;
          console.log('Group loaded, creator:', groupInfo.creator, 'user:', userOpenid, 'isCreator:', isCreator);
          this.setData({
            groupInfo: groupInfo,
            isCreator: isCreator
          }, () => {
            // Call callback after state is updated
            if (callback) callback();
          });
        }
      }
    });
  },

  toggleMembers() {
    this.setData({ showMembers: !this.data.showMembers });
  },

  kickMember(e) {
    const memberOpenid = e.currentTarget.dataset.openid;
    wx.showModal({
      title: '提示',
      content: '确定将该成员踢出共享组吗？',
      success: res => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'groups',
            data: {
              action: 'kick',
              data: {
                groupId: this.data.groupId,
                memberOpenid: memberOpenid
              }
            },
            success: res => {
              if (res.result && res.result.code === 0) {
                wx.showToast({ title: '已踢出' });
                this.loadGroupInfo();
              } else {
                wx.showToast({ title: res.result.message || '操作失败', icon: 'none' });
              }
            }
          });
        }
      }
    });
  },

  loadGroupNotes() {
    wx.cloud.callFunction({
      name: 'groups',
      data: {
        action: 'getNotes',
        data: { groupId: this.data.groupId }
      },
      success: res => {
        if (res.result && res.result.code === 0) {
          const notes = (res.result.data.list || []).map(note => ({
            ...note,
            contentSegments: this.parseSegments(note.content)
          }));
          this.setData({ notes });
        }
      }
    });
  },

  showAddModal() {
    this.setData({
      showAddModal: true,
      noteTitle: '',
      noteContent: '',
      selectedColor: '#ffffff'
    });
  },

  closeAddModal() {
    this.setData({ showAddModal: false });
  },

  onTitleInput(e) {
    this.setData({ noteTitle: e.detail.value });
  },

  onContentInput(e) {
    this.setData({ noteContent: e.detail.value });
  },

  selectColor(e) {
    this.setData({ selectedColor: e.currentTarget.dataset.color });
  },

  addNote() {
    const content = this.data.noteContent.trim();
    if (!content) {
      wx.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }
    wx.cloud.callFunction({
      name: 'groups',
      data: {
        action: 'addNote',
        data: {
          groupId: this.data.groupId,
          title: this.data.noteTitle.trim(),
          content: content,
          color: this.data.selectedColor
        }
      },
      success: res => {
        if (res.result && res.result.code === 0) {
          wx.showToast({ title: '添加成功' });
          this.setData({ showAddModal: false });
          this.loadGroupNotes();
        } else {
          wx.showToast({ title: res.result.message || '添加失败', icon: 'none' });
        }
      }
    });
  },

  showEditModal(e) {
    const note = e.currentTarget.dataset.note;
    this.setData({
      showEditModal: true,
      currentEditNote: note,
      noteTitle: note.title,
      noteContent: note.content,
      selectedColor: note.color || '#ffffff'
    });
  },

  closeEditModal() {
    this.setData({ showEditModal: false });
  },

  updateNote() {
    const content = this.data.noteContent.trim();
    if (!content) {
      wx.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }
    wx.cloud.callFunction({
      name: 'groups',
      data: {
        action: 'updateNote',
        data: {
          id: this.data.currentEditNote._id,
          title: this.data.noteTitle.trim(),
          content: content,
          color: this.data.selectedColor
        }
      },
      success: res => {
        if (res.result && res.result.code === 0) {
          wx.showToast({ title: '修改成功' });
          this.setData({ showEditModal: false });
          this.loadGroupNotes();
        } else {
          wx.showToast({ title: res.result.message || '修改失败', icon: 'none' });
        }
      }
    });
  },

  deleteNote(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '提示',
      content: '确定删除这条共享小记吗？',
      success: res => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'groups',
            data: {
              action: 'deleteNote',
              data: { id }
            },
            success: res => {
              if (res.result && res.result.code === 0) {
                wx.showToast({ title: '删除成功' });
                this.loadGroupNotes();
              } else {
                wx.showToast({ title: res.result.message || '删除失败', icon: 'none' });
              }
            }
          });
        }
      }
    });
  },

  leaveGroup() {
    wx.showModal({
      title: '提示',
      content: '确定退出这个共享组吗？',
      success: res => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'groups',
            data: {
              action: 'leave',
              data: { groupId: this.data.groupId }
            },
            success: res => {
              if (res.result && res.result.code === 0) {
                wx.showToast({ title: '已退出' });
                wx.navigateBack();
              } else {
                wx.showToast({ title: res.result.message || '退出失败', icon: 'none' });
              }
            }
          });
        }
      }
    });
  },

  // Group Todos Methods
  loadGroupTodos() {
    wx.cloud.callFunction({
      name: 'groups',
      data: {
        action: 'getTodos',
        data: { groupId: this.data.groupId }
      },
      success: res => {
        if (res.result && res.result.code === 0) {
          const todos = (res.result.data.list || []).map(todo => ({
            ...todo,
            contentSegments: this.parseSegments(todo.content)
          }));
          this.setData({ todos });
        }
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
      creatorName: this.data.userInfo.nickName || '我',
      isTemp: true
    };
    
    // Add to local state immediately
    const todos = [tempTodo, ...this.data.todos];
    this.setData({ todos, newTodo: '' });
    
    // Sync with server in background
    wx.cloud.callFunction({
      name: 'groups',
      data: {
        action: 'addTodo',
        data: { groupId: this.data.groupId, content }
      },
      success: res => {
        if (res.result && res.result.code === 0) {
          // Replace temp todo with real one from server
          this.loadGroupTodos();
        } else {
          wx.showToast({ title: res.result.message || '添加失败', icon: 'none' });
          // Remove temp todo on failure
          const todos = this.data.todos.filter(t => t._id !== tempId);
          this.setData({ todos });
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
      name: 'groups',
      data: {
        action: 'toggleTodo',
        data: { id: item._id, completed: newCompleted }
      },
      fail: () => {
        // Revert on failure
        wx.showToast({ title: '更新失败', icon: 'none' });
        this.loadGroupTodos();
      }
    });
  },

  editTodo(e) {
    const item = e.currentTarget.dataset.item;
    this.setData({
      showTodoEditModal: true,
      editTodoContent: item.content,
      currentEditTodo: item
    });
  },

  closeTodoEditModal() {
    this.setData({ showTodoEditModal: false });
  },

  onEditTodoInput(e) {
    this.setData({ editTodoContent: e.detail.value });
  },

  confirmEditTodo() {
    const content = this.data.editTodoContent.trim();
    if (!content) {
      wx.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }

    wx.cloud.callFunction({
      name: 'groups',
      data: {
        action: 'updateTodo',
        data: { id: this.data.currentEditTodo._id, content }
      },
      success: res => {
        if (res.result && res.result.code === 0) {
          wx.showToast({ title: '修改成功' });
          this.setData({ showTodoEditModal: false });
          this.loadGroupTodos();
        } else {
          wx.showToast({ title: res.result.message || '修改失败', icon: 'none' });
        }
      }
    });
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
            name: 'groups',
            data: {
              action: 'deleteTodo',
              data: { id }
            },
            fail: () => {
              wx.showToast({ title: '删除失败', icon: 'none' });
              this.loadGroupTodos();
            }
          });
        }
      }
    });
  },

  // Fold methods
  toggleNotes() {
    this.setData({ notesCollapsed: !this.data.notesCollapsed });
  },

  toggleTodos() {
    this.setData({ todosCollapsed: !this.data.todosCollapsed });
  },

  // Batch methods for Notes
  enterNotesBatchMode() {
    this.setData({ notesBatchMode: true, selectedNotes: [] });
  },

  exitNotesBatchMode() {
    const notes = this.data.notes.map(item => ({ ...item, selected: false }));
    this.setData({ notesBatchMode: false, selectedNotes: [], notes });
  },

  toggleNoteSelect(e) {
    const id = e.currentTarget.dataset.id;
    const notes = this.data.notes.map(item => {
      if (item._id === id) return { ...item, selected: !item.selected };
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
      wx.showToast({ title: '请先选择', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认删除',
      content: `确定删除选中的 ${selectedNotes.length} 项吗？`,
      success: res => {
        if (res.confirm) {
          const tasks = selectedNotes.map(id => wx.cloud.callFunction({
            name: 'groups',
            data: { action: 'deleteNote', data: { id } }
          }));
          Promise.all(tasks).then(() => {
            wx.showToast({ title: '删除成功' });
            this.exitNotesBatchMode();
            this.loadGroupNotes();
          });
        }
      }
    });
  },

  // Batch methods for Todos
  enterTodosBatchMode() {
    this.setData({ todosBatchMode: true, selectedTodos: [] });
  },

  exitTodosBatchMode() {
    const todos = this.data.todos.map(item => ({ ...item, selected: false }));
    this.setData({ todosBatchMode: false, selectedTodos: [], todos });
  },

  toggleTodoSelect(e) {
    const id = e.currentTarget.dataset.id;
    const todos = this.data.todos.map(item => {
      if (item._id === id) return { ...item, selected: !item.selected };
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
    const { selectedTodos, todos } = this.data;
    if (selectedTodos.length === 0) {
      wx.showToast({ title: '请先选择', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认删除',
      content: `确定删除选中的 ${selectedTodos.length} 项吗？`,
      success: res => {
        if (res.confirm) {
          // Remove selected items from local state immediately
          const remainingTodos = todos.filter(item => !selectedTodos.includes(item._id));
          this.setData({ todos: remainingTodos });
          wx.showToast({ title: '删除成功' });
          this.exitTodosBatchMode();
          
          // Sync with server in background
          const tasks = selectedTodos.map(id => wx.cloud.callFunction({
            name: 'groups',
            data: { action: 'deleteTodo', data: { id } }
          }));
          Promise.all(tasks).catch(() => {
            wx.showToast({ title: '部分删除失败', icon: 'none' });
            this.loadGroupTodos();
          });
        }
      }
    });
  },

  // History
  showNoteHistory(e) {
    const note = e.currentTarget.dataset.note;
    if (note.history && note.history.length > 0) {
      // Reverse to show newest first
      const history = [...note.history].reverse();
      this.setData({
        showHistoryModal: true,
        currentHistory: history,
        currentHistoryType: 'note'
      });
    }
  },

  showTodoHistory(e) {
    const todo = e.currentTarget.dataset.todo;
    if (todo.history && todo.history.length > 0) {
      const history = [...todo.history].reverse();
      this.setData({
        showHistoryModal: true,
        currentHistory: history,
        currentHistoryType: 'todo'
      });
    }
  },

  closeHistoryModal() {
    this.setData({
      showHistoryModal: false,
      currentHistory: [],
      currentHistoryType: 'note'
    });
  },

  // Edit Group Name
  showEditGroupName() {
    this.setData({
      showEditGroupModal: true,
      newGroupName: this.data.groupInfo.name || ''
    });
  },

  closeEditGroupModal() {
    this.setData({
      showEditGroupModal: false,
      newGroupName: ''
    });
  },

  onGroupNameInput(e) {
    this.setData({ newGroupName: e.detail.value });
  },

  updateGroupName() {
    const name = this.data.newGroupName.trim();
    if (!name) {
      wx.showToast({ title: '请输入组名', icon: 'none' });
      return;
    }
    wx.cloud.callFunction({
      name: 'groups',
      data: {
        action: 'updateGroup',
        data: {
          groupId: this.data.groupId,
          name: name
        }
      },
      success: res => {
        if (res.result && res.result.code === 0) {
          wx.showToast({ title: '修改成功' });
          this.setData({
            showEditGroupModal: false,
            'groupInfo.name': name
          });
        } else {
          wx.showToast({ title: res.result.message || '修改失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '修改失败', icon: 'none' });
      }
    });
  },

  // Preview
  previewNote(e) {
    const note = e.currentTarget.dataset.note;
    this.setData({
      showPreviewModal: true,
      previewData: note,
      previewType: 'note'
    });
  },

  previewTodo(e) {
    const todo = e.currentTarget.dataset.item;
    this.setData({
      showPreviewModal: true,
      previewData: todo,
      previewType: 'todo'
    });
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

  closePreviewModal() {
    this.setData({
      showPreviewModal: false,
      previewData: {}
    });
  },

  editFromPreview() {
    const { previewData, previewType } = this.data;
    this.closePreviewModal();
    
    if (previewType === 'note') {
      this.setData({
        showEditModal: true,
        currentEditNote: previewData,
        noteTitle: previewData.title || '',
        noteContent: previewData.content || '',
        selectedColor: previewData.color || '#ffffff'
      });
    } else {
      this.setData({
        showTodoEditModal: true,
        currentEditTodo: previewData,
        editTodoContent: previewData.content
      });
    }
  },

  // Join Requests
  loadJoinRequests() {
    if (!this.data.isCreator) {
      console.log('Not creator, skipping join requests load');
      return;
    }
    console.log('Loading join requests for group:', this.data.groupId);
    
    wx.cloud.callFunction({
      name: 'groups',
      data: {
        action: 'getJoinRequests',
        data: { groupId: this.data.groupId }
      },
      success: res => {
        console.log('Join requests response:', res.result);
        if (res.result && res.result.code === 0) {
          const requests = res.result.data.list || [];
          console.log('Join requests loaded:', requests.length);
          this.setData({ joinRequests: requests });
        }
      }
    });
  },

  toggleJoinRequests() {
    this.setData({ showJoinRequests: !this.data.showJoinRequests });
  },

  approveJoin(e) {
    const requestId = e.currentTarget.dataset.id;
    wx.cloud.callFunction({
      name: 'groups',
      data: {
        action: 'approveJoin',
        data: { requestId }
      },
      success: res => {
        if (res.result && res.result.code === 0) {
          wx.showToast({ title: '已同意' });
          this.loadJoinRequests();
          this.loadGroupInfo();
        } else {
          wx.showToast({ title: res.result.message || '操作失败', icon: 'none' });
        }
      }
    });
  },

  rejectJoin(e) {
    const requestId = e.currentTarget.dataset.id;
    wx.cloud.callFunction({
      name: 'groups',
      data: {
        action: 'rejectJoin',
        data: { requestId }
      },
      success: res => {
        if (res.result && res.result.code === 0) {
          wx.showToast({ title: '已拒绝' });
          this.loadJoinRequests();
        } else {
          wx.showToast({ title: res.result.message || '操作失败', icon: 'none' });
        }
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

  // Handle creator avatar load error
  onCreatorAvatarError(e) {
    const { avatar, index } = e.currentTarget.dataset;
    // If it's a cloud fileID, the cloud function should have converted it
    // If it's an expired temp URL, we can't refresh it easily without reloading data
    // Just fallback to default for now
    if (avatar && !avatar.startsWith('cloud://')) {
      const todos = this.data.todos;
      if (todos[index]) {
        todos[index].creatorAvatar = '/static/icon/headPortrait.png';
        this.setData({ todos });
      }
    }
  }
});
