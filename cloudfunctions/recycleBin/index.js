// Cloud function for recycle bin functionality
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const RETENTION_DAYS = 15;

exports.main = async (event, context) => {
  const { action, data } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  console.log('RecycleBin action:', action, 'openid:', openid);

  try {
    switch (action) {
      case 'list':
        return await listRecycleBin(openid);
      case 'restorePersonalNote':
        return await restorePersonalNote(data, openid);
      case 'restorePersonalTodo':
        return await restorePersonalTodo(data, openid);
      case 'restoreSharedNote':
        return await restoreSharedNote(data, openid);
      case 'restoreSharedTodo':
        return await restoreSharedTodo(data, openid);
      case 'permanentDeletePersonalNote':
        return await permanentDeletePersonalNote(data, openid);
      case 'permanentDeletePersonalTodo':
        return await permanentDeletePersonalTodo(data, openid);
      case 'permanentDeleteSharedNote':
        return await permanentDeleteSharedNote(data, openid);
      case 'permanentDeleteSharedTodo':
        return await permanentDeleteSharedTodo(data, openid);
      case 'clearExpired':
        return await clearExpiredItems(openid);
      case 'clearAll':
        return await clearAllItems(openid);
      case 'clearPersonalExpired':
        return await clearPersonalExpired(openid);
      case 'clearSharedExpired':
        return await clearSharedExpired(openid);
      case 'clearAllPersonal':
        return await clearAllPersonal(openid);
      case 'clearAllShared':
        return await clearAllShared(openid);
      default:
        return { code: -1, message: 'Unknown action', data: null };
    }
  } catch (error) {
    return { code: -1, message: error.message, data: null };
  }
};

// List all items in recycle bin (only non-expired items)
async function listRecycleBin(openid) {
  console.log('Listing recycle bin for openid:', openid);

  // Get personal deleted notes (not expired, or no deleteTime for backward compatibility)
  const personalNotes = await db.collection('notes').where({
    _openid: openid,
    isDeleted: true
  }).get();
  
  console.log('Personal notes found:', personalNotes.data.length);

  // Get personal deleted todos (not expired)
  const personalTodos = await db.collection('todos').where({
    _openid: openid,
    isDeleted: true
  }).get();
  
  console.log('Personal todos found:', personalTodos.data.length);

  // Get shared deleted notes (deleted by this user)
  const sharedNotes = await db.collection('group_notes').where({
    isDeleted: true,
    deletedBy: openid
  }).orderBy('deleteTime', 'desc').get();

  // Get shared deleted todos (deleted by this user)
  const sharedTodos = await db.collection('group_todos').where({
    isDeleted: true,
    deletedBy: openid
  }).orderBy('deleteTime', 'desc').get();

  // Calculate remaining days and add group names
  const now = new Date();
  
  const processItem = (item) => {
    // If no deleteTime, use updateTime or current time as fallback
    const deleteTime = item.deleteTime ? new Date(item.deleteTime) : 
                      (item.updateTime ? new Date(item.updateTime) : new Date());
    const diffTime = now.getTime() - deleteTime.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const remainingDays = RETENTION_DAYS - diffDays;
    
    return {
      ...item,
      deleteTime: deleteTime,
      deleteTimeStr: formatDateTime(deleteTime),
      remainingDays: remainingDays,
      isExpired: remainingDays <= 0
    };
  };

  // Filter out expired items and process
  console.log('Before processing - personalNotes:', personalNotes.data.length);
  const personalNotesProcessed = personalNotes.data
    .map(processItem)
    .filter(item => !item.isExpired);
  console.log('After filtering - personalNotes:', personalNotesProcessed.length);
  
  const personalTodosProcessed = personalTodos.data
    .map(processItem)
    .filter(item => !item.isExpired);

  const sharedNotesWithGroup = (await Promise.all(sharedNotes.data.map(async item => {
    const group = await db.collection('groups').doc(item.groupId).get();
    const processed = processItem(item);
    if (processed.isExpired) return null;
    return {
      ...processed,
      groupName: group.data ? group.data.name : '未知群组'
    };
  }))).filter(item => item !== null);

  const sharedTodosWithGroup = (await Promise.all(sharedTodos.data.map(async item => {
    const group = await db.collection('groups').doc(item.groupId).get();
    const processed = processItem(item);
    if (processed.isExpired) return null;
    return {
      ...processed,
      groupName: group.data ? group.data.name : '未知群组'
    };
  }))).filter(item => item !== null);

  console.log('Final counts:', {
    personalNotes: personalNotesProcessed.length,
    personalTodos: personalTodosProcessed.length,
    sharedNotes: sharedNotesWithGroup.length,
    sharedTodos: sharedTodosWithGroup.length
  });

  return {
    code: 0,
    message: 'success',
    data: {
      personalNotes: personalNotesProcessed,
      personalTodos: personalTodosProcessed,
      sharedNotes: sharedNotesWithGroup,
      sharedTodos: sharedTodosWithGroup
    }
  };
}

// Restore personal note
async function restorePersonalNote(data, openid) {
  const { id } = data || {};
  if (!id) return { code: -1, message: 'ID is required', data: null };

  await db.collection('notes').doc(id).update({
    data: {
      isDeleted: false,
      deleteTime: null
    }
  });

  return { code: 0, message: 'success', data: null };
}

// Restore personal todo
async function restorePersonalTodo(data, openid) {
  const { id } = data || {};
  if (!id) return { code: -1, message: 'ID is required', data: null };

  await db.collection('todos').doc(id).update({
    data: {
      isDeleted: false,
      deleteTime: null
    }
  });

  return { code: 0, message: 'success', data: null };
}

// Restore shared note
async function restoreSharedNote(data, openid) {
  const { id } = data || {};
  if (!id) return { code: -1, message: 'ID is required', data: null };

  const note = await db.collection('group_notes').doc(id).get();
  if (!note.data) return { code: -1, message: 'Note not found', data: null };

  // Check if user is member of the group
  const group = await db.collection('groups').doc(note.data.groupId).get();
  if (!group.data || !group.data.members.includes(openid)) {
    return { code: -1, message: 'No permission', data: null };
  }

  await db.collection('group_notes').doc(id).update({
    data: {
      isDeleted: false,
      deleteTime: null,
      deletedBy: null
    }
  });

  return { code: 0, message: 'success', data: null };
}

// Restore shared todo
async function restoreSharedTodo(data, openid) {
  const { id } = data || {};
  if (!id) return { code: -1, message: 'ID is required', data: null };

  const todo = await db.collection('group_todos').doc(id).get();
  if (!todo.data) return { code: -1, message: 'Todo not found', data: null };

  // Check if user is member of the group
  const group = await db.collection('groups').doc(todo.data.groupId).get();
  if (!group.data || !group.data.members.includes(openid)) {
    return { code: -1, message: 'No permission', data: null };
  }

  await db.collection('group_todos').doc(id).update({
    data: {
      isDeleted: false,
      deleteTime: null,
      deletedBy: null
    }
  });

  return { code: 0, message: 'success', data: null };
}

// Permanent delete functions
async function permanentDeletePersonalNote(data, openid) {
  const { id } = data || {};
  if (!id) return { code: -1, message: 'ID is required', data: null };

  await db.collection('notes').doc(id).remove();
  return { code: 0, message: 'success', data: null };
}

async function permanentDeletePersonalTodo(data, openid) {
  const { id } = data || {};
  if (!id) return { code: -1, message: 'ID is required', data: null };

  await db.collection('todos').doc(id).remove();
  return { code: 0, message: 'success', data: null };
}

async function permanentDeleteSharedNote(data, openid) {
  const { id } = data || {};
  if (!id) return { code: -1, message: 'ID is required', data: null };

  await db.collection('group_notes').doc(id).remove();
  return { code: 0, message: 'success', data: null };
}

async function permanentDeleteSharedTodo(data, openid) {
  const { id } = data || {};
  if (!id) return { code: -1, message: 'ID is required', data: null };

  await db.collection('group_todos').doc(id).remove();
  return { code: 0, message: 'success', data: null };
}

// Clear all expired items
async function clearExpiredItems(openid) {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() - RETENTION_DAYS);

  let deletedCount = 0;

  // Delete expired personal notes
  const expiredNotes = await db.collection('notes').where({
    isDeleted: true,
    deleteTime: _.lt(expiryDate)
  }).get();

  for (const item of expiredNotes.data) {
    await db.collection('notes').doc(item._id).remove();
    deletedCount++;
  }

  // Delete expired personal todos
  const expiredTodos = await db.collection('todos').where({
    isDeleted: true,
    deleteTime: _.lt(expiryDate)
  }).get();

  for (const item of expiredTodos.data) {
    await db.collection('todos').doc(item._id).remove();
    deletedCount++;
  }

  // Delete expired shared notes
  const expiredSharedNotes = await db.collection('group_notes').where({
    isDeleted: true,
    deleteTime: _.lt(expiryDate)
  }).get();

  for (const item of expiredSharedNotes.data) {
    await db.collection('group_notes').doc(item._id).remove();
    deletedCount++;
  }

  // Delete expired shared todos
  const expiredSharedTodos = await db.collection('group_todos').where({
    isDeleted: true,
    deleteTime: _.lt(expiryDate)
  }).get();

  for (const item of expiredSharedTodos.data) {
    await db.collection('group_todos').doc(item._id).remove();
    deletedCount++;
  }

  return {
    code: 0,
    message: 'success',
    data: { deletedCount }
  };
}

// Clear all items in recycle bin
async function clearAllItems(openid) {
  let deletedCount = 0;

  // Delete all personal deleted notes
  const personalNotes = await db.collection('notes').where({
    _openid: openid,
    isDeleted: true
  }).get();

  for (const item of personalNotes.data) {
    await db.collection('notes').doc(item._id).remove();
    deletedCount++;
  }

  // Delete all personal deleted todos
  const personalTodos = await db.collection('todos').where({
    _openid: openid,
    isDeleted: true
  }).get();

  for (const item of personalTodos.data) {
    await db.collection('todos').doc(item._id).remove();
    deletedCount++;
  }

  // Delete all shared deleted notes (deleted by this user)
  const sharedNotes = await db.collection('group_notes').where({
    isDeleted: true,
    deletedBy: openid
  }).get();

  for (const item of sharedNotes.data) {
    await db.collection('group_notes').doc(item._id).remove();
    deletedCount++;
  }

  // Delete all shared deleted todos (deleted by this user)
  const sharedTodos = await db.collection('group_todos').where({
    isDeleted: true,
    deletedBy: openid
  }).get();

  for (const item of sharedTodos.data) {
    await db.collection('group_todos').doc(item._id).remove();
    deletedCount++;
  }

  return {
    code: 0,
    message: 'success',
    data: { deletedCount }
  };
}

// Helper function to format date time (China timezone UTC+8)
function formatDateTime(date) {
  if (!date) return '';
  const d = new Date(date);
  // Convert to China timezone (UTC+8)
  const chinaTime = new Date(d.getTime() + (8 * 60 * 60 * 1000));
  const month = (chinaTime.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = chinaTime.getUTCDate().toString().padStart(2, '0');
  const hours = chinaTime.getUTCHours().toString().padStart(2, '0');
  const minutes = chinaTime.getUTCMinutes().toString().padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}`;
}

// Clear personal expired items only
async function clearPersonalExpired(openid) {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() - RETENTION_DAYS);
  let deletedCount = 0;

  // Delete expired personal notes
  const personalNotes = await db.collection('notes').where({
    _openid: openid,
    isDeleted: true,
    deleteTime: _.lt(expiryDate)
  }).get();

  for (const item of personalNotes.data) {
    await db.collection('notes').doc(item._id).remove();
    deletedCount++;
  }

  // Delete expired personal todos
  const personalTodos = await db.collection('todos').where({
    _openid: openid,
    isDeleted: true,
    deleteTime: _.lt(expiryDate)
  }).get();

  for (const item of personalTodos.data) {
    await db.collection('todos').doc(item._id).remove();
    deletedCount++;
  }

  return {
    code: 0,
    message: 'success',
    data: { deletedCount }
  };
}

// Clear shared expired items only
async function clearSharedExpired(openid) {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() - RETENTION_DAYS);
  let deletedCount = 0;

  // Delete expired shared notes (deleted by this user)
  const sharedNotes = await db.collection('group_notes').where({
    isDeleted: true,
    deletedBy: openid,
    deleteTime: _.lt(expiryDate)
  }).get();

  for (const item of sharedNotes.data) {
    await db.collection('group_notes').doc(item._id).remove();
    deletedCount++;
  }

  // Delete expired shared todos (deleted by this user)
  const sharedTodos = await db.collection('group_todos').where({
    isDeleted: true,
    deletedBy: openid,
    deleteTime: _.lt(expiryDate)
  }).get();

  for (const item of sharedTodos.data) {
    await db.collection('group_todos').doc(item._id).remove();
    deletedCount++;
  }

  return {
    code: 0,
    message: 'success',
    data: { deletedCount }
  };
}

// Clear all personal items
async function clearAllPersonal(openid) {
  let deletedCount = 0;

  // Delete all personal deleted notes
  const personalNotes = await db.collection('notes').where({
    _openid: openid,
    isDeleted: true
  }).get();

  for (const item of personalNotes.data) {
    await db.collection('notes').doc(item._id).remove();
    deletedCount++;
  }

  // Delete all personal deleted todos
  const personalTodos = await db.collection('todos').where({
    _openid: openid,
    isDeleted: true
  }).get();

  for (const item of personalTodos.data) {
    await db.collection('todos').doc(item._id).remove();
    deletedCount++;
  }

  return {
    code: 0,
    message: 'success',
    data: { deletedCount }
  };
}

// Clear all shared items
async function clearAllShared(openid) {
  let deletedCount = 0;

  // Delete all shared deleted notes (deleted by this user)
  const sharedNotes = await db.collection('group_notes').where({
    isDeleted: true,
    deletedBy: openid
  }).get();

  for (const item of sharedNotes.data) {
    await db.collection('group_notes').doc(item._id).remove();
    deletedCount++;
  }

  // Delete all shared deleted todos (deleted by this user)
  const sharedTodos = await db.collection('group_todos').where({
    isDeleted: true,
    deletedBy: openid
  }).get();

  for (const item of sharedTodos.data) {
    await db.collection('group_todos').doc(item._id).remove();
    deletedCount++;
  }

  return {
    code: 0,
    message: 'success',
    data: { deletedCount }
  };
}

