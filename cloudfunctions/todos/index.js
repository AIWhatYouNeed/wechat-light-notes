// Cloud function for todos CRUD operations
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
        return await getTodosList(data);
      case 'create':
        return await addTodo(data);
      case 'update':
        return await updateTodo(data);
      case 'delete':
        return await deleteTodo(data);
      case 'toggle':
        return await toggleTodo(data);
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

// Get todos list
async function getTodosList(data) {
  const { keyword = '' } = data || {};
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  
  let query = db.collection('todos').where({
    _openid: openid,
    isDeleted: _.neq(true)
  });
  
  if (keyword) {
    query = query.where({
      content: db.RegExp({ regexp: keyword, options: 'i' })
    });
  }
  
  const result = await query
    .orderBy('createTime', 'desc')
    .get();
  
  return {
    code: 0,
    message: 'success',
    data: {
      list: result.data || []
    }
  };
}

// Add new todo
async function addTodo(data) {
  const { content } = data || {};
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  
  if (!content) {
    return {
      code: -1,
      message: 'Todo content is required',
      data: null
    };
  }
  
  const now = new Date();
  const result = await db.collection('todos').add({
    data: {
      content: content,
      completed: false,
      createTime: now,
      updateTime: now,
      createTimeStr: formatDateTime(now),
      isDeleted: false,
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

// Update todo
async function updateTodo(data) {
  const { id, content, completed } = data || {};
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  
  if (!id) {
    return {
      code: -1,
      message: 'Todo ID is required',
      data: null
    };
  }
  
  // Check ownership
  const todo = await db.collection('todos').doc(id).get();
  if (todo.data && todo.data._openid !== openid) {
    return {
      code: -1,
      message: 'No permission',
      data: null
    };
  }
  
  const updateData = {
    updateTime: new Date()
  };
  
  if (content !== undefined) updateData.content = content;
  if (completed !== undefined) updateData.completed = completed;
  
  await db.collection('todos').doc(id).update({
    data: updateData
  });
  
  return {
    code: 0,
    message: 'success',
    data: null
  };
}

// Toggle todo completed status
async function toggleTodo(data) {
  const { id, completed } = data || {};
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  
  if (!id || completed === undefined) {
    return {
      code: -1,
      message: 'Todo ID and completed status are required',
      data: null
    };
  }
  
  // Check ownership
  const todo = await db.collection('todos').doc(id).get();
  if (todo.data && todo.data._openid !== openid) {
    return {
      code: -1,
      message: 'No permission',
      data: null
    };
  }
  
  await db.collection('todos').doc(id).update({
    data: {
      completed: completed,
      updateTime: new Date()
    }
  });
  
  return {
    code: 0,
    message: 'success',
    data: null
  };
}

// Delete todo (soft delete)
async function deleteTodo(data) {
  const { id } = data || {};
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  
  if (!id) {
    return {
      code: -1,
      message: 'Todo ID is required',
      data: null
    };
  }
  
  // Check ownership
  const todo = await db.collection('todos').doc(id).get();
  if (todo.data && todo.data._openid !== openid) {
    return {
      code: -1,
      message: 'No permission',
      data: null
    };
  }
  
  await db.collection('todos').doc(id).update({
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

// Helper function to format date time (China timezone UTC+8)
function formatDateTime(date) {
  // Convert to China timezone (UTC+8)
  const chinaTime = new Date(date.getTime() + (8 * 60 * 60 * 1000));
  const month = (chinaTime.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = chinaTime.getUTCDate().toString().padStart(2, '0');
  const hours = chinaTime.getUTCHours().toString().padStart(2, '0');
  const minutes = chinaTime.getUTCMinutes().toString().padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}`;
}
