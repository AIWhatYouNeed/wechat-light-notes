Page({
  data: {
    id: '',
    title: '',
    content: '',
    parsedContent: [],
    color: '#ffffff',
    isEdit: false,
    cursorPosition: 0
  },

  // Editor context
  editorCtx: null,

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
            parsedContent: this.parseContent(note.content),
            color: note.color || '#ffffff'
          });
          // Set editor content if editor is ready
          if (this.editorCtx) {
            this.editorCtx.setContents({
              html: this.plainTextToHtml(note.content)
            });
          }
        }
      }
    });
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value });
  },

  // Editor ready callback
  onEditorReady() {
    const that = this;
    wx.createSelectorQuery().in(this).select('#contentEditor').context(function(res) {
      that.editorCtx = res.context;
      // Set initial content if editing
      if (that.data.isEdit && that.data.content) {
        that.editorCtx.setContents({
          html: that.plainTextToHtml(that.data.content)
        });
      }
    }).exec();
  },

  // Convert plain text to simple HTML for editor
  plainTextToHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  },

  // Convert editor HTML to plain text
  htmlToPlainText(html) {
    if (!html) return '';
    return html
      .replace(/<div><br><\/div>/gi, '\n')
      .replace(/<p><br><\/p>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .trim();
  },

  // Editor input handler
  onEditorInput(e) {
    const html = e.detail.html;
    const text = e.detail.text;
    const content = this.htmlToPlainText(html);
    this.setData({ 
      content: content,
      parsedContent: this.parseContent(content)
    });
  },

  // Preview image with zoom
  previewImage(e) {
    const { src } = e.currentTarget.dataset;
    if (!src) return;
    
    // Get all images in the content for preview navigation
    const allImages = [];
    const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    while ((match = imagePattern.exec(this.data.content)) !== null) {
      allImages.push(match[2]);
    }
    
    // Get temp URLs for all images
    if (allImages.length > 0) {
      wx.cloud.getTempFileURL({
        fileList: allImages,
        success: res => {
          const urls = res.fileList.map(f => f.tempFileURL);
          const currentUrl = res.fileList.find(f => f.fileID === src)?.tempFileURL || src;
          
          wx.previewImage({
            current: currentUrl,
            urls: urls
          });
        },
        fail: () => {
          // Fallback: preview single image
          wx.previewImage({
            current: src,
            urls: [src]
          });
        }
      });
    } else {
      wx.previewImage({
        current: src,
        urls: [src]
      });
    }
  },

  // Insert Markdown syntax at cursor position using editor API
  insertMarkdownAtCursor(text, selectionLength = 0) {
    if (!this.editorCtx) return;
    
    this.editorCtx.insertText({
      text: text
    });
    
    // If selectionLength > 0, move cursor back to select placeholder
    if (selectionLength > 0) {
      // Get current selection and adjust
      this.editorCtx.getSelectionRange({
        success: res => {
          const currentEnd = res.end;
          const newStart = currentEnd - selectionLength;
          this.editorCtx.setSelectionRange({
            start: newStart,
            end: currentEnd
          });
        }
      });
    }
  },

  // Bold
  insertBold() {
    // Insert **** and place cursor in middle
    this.insertMarkdownAtCursor('****', 2);
  },

  // Italic
  insertItalic() {
    // Insert ** and place cursor in middle
    this.insertMarkdownAtCursor('**', 1);
  },

  // Heading
  insertHeading() {
    // Insert ## 
    this.insertMarkdownAtCursor('## ', 0);
  },

  // Unordered List
  insertList() {
    // Insert - 
    this.insertMarkdownAtCursor('- ', 0);
  },

  // Ordered List
  insertOrderedList() {
    // Insert 1. 
    this.insertMarkdownAtCursor('1. ', 0);
  },

  // Code block
  insertCode() {
    // Insert ```\n\n``` and place cursor in middle
    this.insertMarkdownAtCursor('```\n\n```', 4);
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
      }
    });
  },

  doUploadImage(filePath) {
    wx.showLoading({ title: '上传中...' });
    
    const cloudPath = `notes/images/${Date.now()}_${Math.random().toString(36).substr(2, 6)}.jpg`;
    
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: filePath,
      success: res => {
        const fileID = res.fileID;
        // Insert Markdown image syntax using editor
        if (this.editorCtx) {
          const imageMarkdown = `![image](${fileID})`;
          this.editorCtx.insertText({
            text: imageMarkdown
          });
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

  // Parse content into segments for preview (Full Markdown support)
  parseContent(text) {
    if (!text) return [{ type: 'text', content: '' }];
    
    const segments = [];
    const lines = text.split('\n');
    
    lines.forEach((line, lineIndex) => {
      // Handle empty lines
      if (!line.trim()) {
        segments.push({ type: 'br' });
        return;
      }
      
      // Check for headings (# ## ###)
      const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        segments.push({
          type: 'heading',
          level: level,
          content: this.parseInlineStyles(headingMatch[2])
        });
        return;
      }
      
      // Check for unordered list items (- or *)
      const listMatch = line.match(/^[\-\*]\s+(.+)$/);
      if (listMatch) {
        segments.push({
          type: 'list-item',
          listType: 'unordered',
          content: this.parseInlineStyles(listMatch[1])
        });
        return;
      }
      
      // Check for ordered list items (1. 2. etc)
      const orderedListMatch = line.match(/^(\d+)\.\s+(.+)$/);
      if (orderedListMatch) {
        segments.push({
          type: 'list-item',
          listType: 'ordered',
          number: orderedListMatch[1],
          content: this.parseInlineStyles(orderedListMatch[2])
        });
        return;
      }
      
      // Check for code blocks (```)
      if (line.startsWith('```')) {
        segments.push({ type: 'code-start' });
        return;
      }
      
      // Regular paragraph with inline styles
      segments.push({
        type: 'paragraph',
        content: this.parseInlineStyles(line)
      });
    });
    
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
      
      // Find the earliest match among all patterns
      let earliestMatch = null;
      let earliestPattern = null;
      
      for (const pattern of patterns) {
        const match = remaining.match(pattern.regex);
        if (match && (!earliestMatch || match.index < earliestMatch.index)) {
          earliestMatch = match;
          earliestPattern = pattern;
        }
      }
      
      if (earliestMatch && earliestMatch.index !== undefined) {
        // Add text before the match
        if (earliestMatch.index > 0) {
          segments.push({ type: 'text', content: remaining.substring(0, earliestMatch.index) });
        }
        
        // Add the matched element
        if (earliestPattern.type === 'image') {
          segments.push({
            type: 'image',
            alt: earliestMatch[1],
            src: earliestMatch[2]
          });
        } else if (earliestPattern.type === 'link') {
          segments.push({
            type: 'link',
            content: earliestMatch[0]
          });
        } else {
          segments.push({
            type: earliestPattern.type,
            content: earliestMatch[1]
          });
        }
        
        // Update remaining text
        remaining = remaining.substring(earliestMatch.index + earliestMatch[0].length);
        found = true;
      } else {
        // No more matches, add remaining as plain text
        if (remaining) {
          segments.push({ type: 'text', content: remaining });
        }
        break;
      }
    }
    
    return segments.length > 0 ? segments : [{ type: 'text', content: text }];
  },

  // Open link in webview
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

  // Handle image load error (convert fileID to temp URL)
  onPreviewImageError(e) {
    const { src } = e.currentTarget.dataset;
    if (src && src.startsWith('cloud://')) {
      wx.cloud.getTempFileURL({
        fileList: [src],
        success: res => {
          const tempUrl = res.fileList[0].tempFileURL;
          // Update the preview by triggering a re-render
          this.setData({ tempImageUrl: tempUrl });
        }
      });
    }
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
