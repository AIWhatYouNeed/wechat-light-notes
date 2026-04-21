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
    parsedNoteContent: [],
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

  // Editor contexts
  addEditorCtx: null,
  editEditorCtx: null,

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
      parsedNoteContent: [],
      selectedColor: '#ffffff'
    });
    // Reset editor after modal opens
    setTimeout(() => {
      if (this.addEditorCtx) {
        this.addEditorCtx.setContents({ html: '' });
      }
    }, 100);
  },

  closeAddModal() {
    this.setData({ showAddModal: false });
    this.addEditorCtx = null;
  },

  onTitleInput(e) {
    this.setData({ noteTitle: e.detail.value });
  },

  // Editor ready callbacks
  onAddEditorReady() {
    const that = this;
    wx.createSelectorQuery().in(this).select('#addNoteEditor').context(function(res) {
      if (!res || !res.context) {
        console.error('Add editor context not found');
        return;
      }
      that.addEditorCtx = res.context;
      console.log('Add editor ready, context obtained');
    }).exec();
  },

  onEditEditorReady() {
    const that = this;
    wx.createSelectorQuery().in(this).select('#editNoteEditor').context(function(res) {
      if (!res || !res.context) {
        console.error('Editor context not found');
        return;
      }
      that.editEditorCtx = res.context;
      console.log('Edit editor ready, context obtained');
      
      // Set initial content if editing and content exists
      // Use _pendingEditContent to handle cases where editor ready after showEditModal
      const content = that._pendingEditContent || that.data.noteContent;
      console.log('Setting edit editor content:', content ? content.substring(0, 50) : 'empty');
      
      if (content) {
        const html = that.plainTextToHtml(content);
        console.log('HTML to set:', html.substring(0, 100));
        
        that.editEditorCtx.setContents({
          html: html,
          success: () => {
            console.log('Edit editor content set successfully');
            that._pendingEditContent = null;
          },
          fail: (err) => {
            console.error('Failed to set edit editor content:', err);
            // Retry after a short delay
            setTimeout(() => {
              if (that.editEditorCtx) {
                that.editEditorCtx.setContents({ html: html });
              }
            }, 200);
          }
        });
      }
    }).exec();
  },

  // Convert plain text to HTML for editor
  plainTextToHtml(text) {
    if (!text) return '';
    // Split by newlines and wrap each line in a div for proper line breaks
    return text
      .split('\n')
      .map(line => {
        const escaped = line
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        return `<div>${escaped}</div>`;
      })
      .join('');
  },

  // Convert editor HTML to plain text
  htmlToPlainText(html) {
    if (!html) return '';
    return html
      .replace(/<div><br><\/div>/gi, '\n')
      .replace(/<p><br><\/p>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .replace(/\u00A0/g, ' ')  // Also replace non-breaking space character
      .trim();
  },

  // Editor input handler
  onEditorInput(e) {
    const html = e.detail.html;
    console.log('Editor HTML:', html);
    const content = this.htmlToPlainText(html);
    console.log('Plain text:', content);
    console.log('Parsed:', this.parseContent(content));
    this.setData({
      noteContent: content,
      parsedNoteContent: this.parseContent(content)
    });
  },

  // Insert Markdown at cursor
  insertMarkdownAtCursor(text, selectionLength = 0) {
    const editorCtx = this.data.showAddModal ? this.addEditorCtx : this.editEditorCtx;
    if (!editorCtx) {
      console.error('Editor context not available for toolbar action');
      wx.showToast({ title: '编辑器未就绪', icon: 'none' });
      return;
    }

    // Simply insert text at current cursor position
    editorCtx.insertText({ text: text });
  },

  // Toolbar actions
  insertBold() {
    this.insertMarkdownAtCursor('****', 2);
  },

  insertItalic() {
    this.insertMarkdownAtCursor('**', 1);
  },

  insertHeading() {
    this.insertMarkdownAtCursor('## ', 0);
  },

  insertList() {
    this.insertMarkdownAtCursor('- ', 0);
  },

  insertOrderedList() {
    this.insertMarkdownAtCursor('1. ', 0);
  },

  insertCode() {
    this.insertMarkdownAtCursor('```  ```', 3);
  },

  // Upload image
  uploadImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: res => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        this.doUploadImage(tempFilePath);
      },
      fail: err => {
        console.error('Choose media failed:', err);
        wx.showToast({ title: '选择图片失败', icon: 'none' });
      }
    });
  },

  doUploadImage(filePath) {
    wx.showLoading({ title: '上传中...' });

    const cloudPath = `groupNotes/images/${Date.now()}_${Math.random().toString(36).substr(2, 6)}.jpg`;

    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath,
      success: res => {
        const fileID = res.fileID;
        const editorCtx = this.data.showAddModal ? this.addEditorCtx : this.editEditorCtx;
        if (editorCtx) {
          const imageMarkdown = `![image](${fileID})`;
          editorCtx.insertText({ text: imageMarkdown });
        }
        wx.hideLoading();
        wx.showToast({ title: '图片已插入' });
      },
      fail: err => {
        wx.hideLoading();
        wx.showToast({ title: '上传失败', icon: 'none' });
        console.error('Upload image failed:', err);
      }
    });
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
    // Store content for editor to use when ready
    this._pendingEditContent = note.content || '';
    this.setData({
      showEditModal: true,
      currentEditNote: note,
      noteTitle: note.title,
      noteContent: note.content,
      parsedNoteContent: this.parseContent(note.content),
      selectedColor: note.color || '#ffffff'
    });
    // Clear previous editor context and wait for new editor ready
    this.editEditorCtx = null;
  },

  closeEditModal() {
    this.setData({ 
      showEditModal: false,
      noteContent: '',
      noteTitle: '',
      parsedNoteContent: []
    });
    this.editEditorCtx = null;
    this._pendingEditContent = null;
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
      previewType: 'note',
      parsedPreviewContent: this.parseContent(note.content)
    });
  },

  previewTodo(e) {
    const todo = e.currentTarget.dataset.item;
    this.setData({
      showPreviewModal: true,
      previewData: todo,
      previewType: 'todo',
      parsedPreviewContent: this.parseContent(todo.content)
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

  // Parse content into segments for preview (Full Markdown support)
  parseContent(text) {
    if (!text) return [{ type: 'text', content: '' }];

    const segments = [];
    const lines = text.split('\n');
    console.log('ParseContent lines:', lines);
    let currentParagraph = null;

    const flushParagraph = () => {
      if (currentParagraph) {
        segments.push({
          type: 'paragraph',
          content: currentParagraph
        });
        currentParagraph = null;
      }
    };

    lines.forEach((line) => {
      // Handle empty lines - flush current paragraph and add break
      if (!line.trim()) {
        flushParagraph();
        segments.push({ type: 'br' });
        return;
      }

      // Check for headings (# ## ###)
      const headingMatch = line.match(/^\s*(#{1,3})\s+(.+)$/);
      if (headingMatch) {
        flushParagraph();
        const level = headingMatch[1].length;
        segments.push({
          type: 'heading',
          level: level,
          content: this.parseInlineStyles(headingMatch[2])
        });
        return;
      }

      // Check for unordered list items (- or *)
      const listMatch = line.match(/^\s*[\-\*]\s*(.*)$/);
      if (listMatch && listMatch[1].trim()) {
        flushParagraph();
        segments.push({
          type: 'list-item',
          listType: 'unordered',
          content: this.parseInlineStyles(listMatch[1])
        });
        return;
      }

      // Check for ordered list items (1. 2. etc)
      const orderedListMatch = line.match(/^\s*(\d+)\.\s*(.*)$/);
      if (orderedListMatch && orderedListMatch[2].trim()) {
        flushParagraph();
        segments.push({
          type: 'list-item',
          listType: 'ordered',
          number: orderedListMatch[1],
          content: this.parseInlineStyles(orderedListMatch[2])
        });
        return;
      }

      // Regular text - each line becomes its own paragraph for proper line breaks
      const parsedLine = this.parseInlineStyles(line);
      flushParagraph();
      segments.push({
        type: 'paragraph',
        content: parsedLine
      });
    });

    // Don't forget the last paragraph
    flushParagraph();

    return segments;
  },

  // Parse inline styles (bold, italic, code, links, images)
  parseInlineStyles(text) {
    const segments = [];
    let remaining = text;

    // Patterns for inline elements (order matters - check longer patterns first)
    const patterns = [
      { type: 'image', regex: /!\[([^\]]*)\]\(([^)]+)\)/ },
      { type: 'bold', regex: /\*\*([^*]+)\*\*/ },
      { type: 'italic', regex: /\*([^*]+)\*/ },
      { type: 'code', regex: /`([^`]+)`/ },
      { type: 'link', regex: /(https?:\/\/[^\s]+)/ }
    ];

    while (remaining.length > 0) {
      let found = false;

      // Try each pattern
      for (const pattern of patterns) {
        const match = remaining.match(pattern.regex);
        if (match && match.index === 0) {
          if (pattern.type === 'image') {
            segments.push({
              type: 'image',
              alt: match[1],
              src: match[2]
            });
          } else if (pattern.type === 'link') {
            segments.push({
              type: 'link',
              content: match[0]
            });
          } else {
            segments.push({
              type: pattern.type,
              content: match[1]
            });
          }
          remaining = remaining.slice(match[0].length);
          found = true;
          break;
        }
      }

      if (!found) {
        // No pattern matched, take one character as plain text
        const nextSpecial = remaining.search(/[*!`h]/);
        if (nextSpecial === -1) {
          // No more special characters
          segments.push({ type: 'text', content: remaining });
          break;
        } else if (nextSpecial > 0) {
          // Take text up to the next special character
          segments.push({ type: 'text', content: remaining.slice(0, nextSpecial) });
          remaining = remaining.slice(nextSpecial);
        } else {
          // nextSpecial is 0, but no pattern matched - take one char
          segments.push({ type: 'text', content: remaining[0] });
          remaining = remaining.slice(1);
        }
      }
    }

    return segments;
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

  // Preview image in note
  previewImage(e) {
    const src = e.currentTarget.dataset.src;
    if (!src) return;

    // Get all images from parsedPreviewContent
    const images = [];
    const extractImages = (segments) => {
      segments.forEach(item => {
        if (item.type === 'image' && item.src) {
          images.push(item.src);
        } else if (item.content && Array.isArray(item.content)) {
          extractImages(item.content);
        }
      });
    };

    if (this.data.parsedPreviewContent) {
      extractImages(this.data.parsedPreviewContent);
    }

    const urls = images.length > 0 ? images : [src];
    const current = urls.indexOf(src);

    wx.previewImage({
      urls: urls,
      current: src
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
      const content = previewData.content || '';
      // Store content for editor to use when ready
      this._pendingEditContent = content;
      this.setData({
        showEditModal: true,
        currentEditNote: previewData,
        noteTitle: previewData.title || '',
        noteContent: content,
        parsedNoteContent: this.parseContent(content),
        selectedColor: previewData.color || '#ffffff'
      });
      // Clear previous editor context and wait for new editor ready
      this.editEditorCtx = null;
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
