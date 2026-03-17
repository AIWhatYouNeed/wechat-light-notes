// Cloud function for notes CRUD operations
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// Main entry function
exports.main = async (event, context) => {
  const { action, data } = event;
  
  try {
    switch (action) {
      case 'list':
        return await getNotesList(data);
      case 'get':
        return await getNoteDetail(data);
      case 'create':
        return await addNote(data);
      case 'update':
        return await updateNote(data);
      case 'delete':
        return await deleteNote(data);
      case 'search':
        return await searchNotes(data);
      case 'share':
        return await shareNote(data);
      case 'unshare':
        return await unshareNote(data);
      default:
        return {
          code: -1,
          message: 'Unknown action',
          data: null
        };
    }
  } catch (error) {
    return {
      code: -1,
      message: error.message,
      data: null
    };
  }
};

// Get notes list
async function getNotesList(data) {
  const { page = 1, pageSize = 20, keyword = '' } = data || {};
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  
  let query = db.collection('notes').where({
    _openid: openid,
    isDeleted: _.neq(true)
  });
  
  if (keyword) {
    query = query.where(_.or([
      { title: db.RegExp({ regexp: keyword, options: 'i' }) },
      { content: db.RegExp({ regexp: keyword, options: 'i' }) }
    ]));
  }
  
  const countResult = await query.count();
  const total = countResult.total;
  
  const listResult = await query
    .orderBy('createTime', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();
  
  // Format createTime for each note
  const list = (listResult.data || []).map(note => ({
    ...note,
    createTime: formatDateTime(note.createTime)
  }));

  return {
    code: 0,
    message: 'success',
    data: {
      list,
      total,
      page,
      pageSize
    }
  };
}

// Get note detail
async function getNoteDetail(data) {
  const { id } = data || {};
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  
  if (!id) {
    return {
      code: -1,
      message: 'Note ID is required',
      data: null
    };
  }
  
  const result = await db.collection('notes').doc(id).get();
  
  // Check if the note belongs to current user
  if (result.data && result.data._openid !== openid) {
    return {
      code: -1,
      message: 'No permission',
      data: null
    };
  }
  
  // Format createTime
  if (result.data) {
    result.data.createTime = formatDateTime(result.data.createTime);
  }

  return {
    code: 0,
    message: 'success',
    data: result.data
  };
}

// Add new note
async function addNote(data) {
  const { title, content, color } = data || {};
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  
  if (!content && !title) {
    return {
      code: -1,
      message: 'Note content or title is required',
      data: null
    };
  }
  
  const now = new Date();
  const result = await db.collection('notes').add({
    data: {
      title: title || '',
      content: content || '',
      color: color || '#ffffff',
      createTime: now,
      updateTime: now,
      isDeleted: false,
      shared: false,
      sharePassword: '',
      _openid: openid
    }
  });
  
  return {
    code: 0,
    message: 'success',
    data: {
      id: result._id
    }
  };
}

// Update note
async function updateNote(data) {
  const { id, title, content, color } = data || {};
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  
  if (!id) {
    return {
      code: -1,
      message: 'Note ID is required',
      data: null
    };
  }
  
  // Check ownership
  const note = await db.collection('notes').doc(id).get();
  if (note.data && note.data._openid !== openid) {
    return {
      code: -1,
      message: 'No permission',
      data: null
    };
  }
  
  const updateData = {
    updateTime: new Date()
  };
  
  if (title !== undefined) updateData.title = title;
  if (content !== undefined) updateData.content = content;
  if (color !== undefined) updateData.color = color;
  
  await db.collection('notes').doc(id).update({
    data: updateData
  });
  
  return {
    code: 0,
    message: 'success',
    data: null
  };
}

// Delete note (soft delete)
async function deleteNote(data) {
  const { id } = data || {};
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  
  if (!id) {
    return {
      code: -1,
      message: 'Note ID is required',
      data: null
    };
  }
  
  // Check ownership
  const note = await db.collection('notes').doc(id).get();
  if (note.data && note.data._openid !== openid) {
    return {
      code: -1,
      message: 'No permission',
      data: null
    };
  }
  
  await db.collection('notes').doc(id).update({
    data: {
      isDeleted: true,
      updateTime: new Date()
    }
  });
  
  return {
    code: 0,
    message: 'success',
    data: null
  };
}

// Search notes
async function searchNotes(data) {
  const { keyword } = data || {};
  return await getNotesList({ keyword });
}

// Share note - make it public with password
async function shareNote(data) {
  const { id, sharePassword } = data || {};
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  
  if (!id) {
    return {
      code: -1,
      message: 'Note ID is required',
      data: null
    };
  }
  
  if (!sharePassword) {
    return {
      code: -1,
      message: 'Share password is required',
      data: null
    };
  }
  
  // Check ownership
  const note = await db.collection('notes').doc(id).get();
  if (note.data && note.data._openid !== openid) {
    return {
      code: -1,
      message: 'No permission',
      data: null
    };
  }
  
  await db.collection('notes').doc(id).update({
    data: {
      shared: true,
      sharePassword: sharePassword,
      updateTime: new Date()
    }
  });
  
  return {
    code: 0,
    message: 'Note shared successfully',
    data: null
  };
}

// Unshare note - make it private
async function unshareNote(data) {
  const { id } = data || {};
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  
  if (!id) {
    return {
      code: -1,
      message: 'Note ID is required',
      data: null
    };
  }
  
  // Check ownership
  const note = await db.collection('notes').doc(id).get();
  if (note.data && note.data._openid !== openid) {
    return {
      code: -1,
      message: 'No permission',
      data: null
    };
  }
  
  await db.collection('notes').doc(id).update({
    data: {
      shared: false,
      sharePassword: '',
      updateTime: new Date()
    }
  });
  
  return {
    code: 0,
    message: 'Note unshared successfully',
    data: null
  };
}

// Helper function to format date
function formatDate(date) {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}`;
}

// Format date to Beijing time string (MM-DD HH:mm)
function formatDateTime(date) {
  if (!date) return '';
  const d = new Date(date);
  // Convert to Beijing time (UTC+8)
  const beijingTime = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(beijingTime.getUTCDate()).padStart(2, '0');
  const hours = String(beijingTime.getUTCHours()).padStart(2, '0');
  const minutes = String(beijingTime.getUTCMinutes()).padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}`;
}

