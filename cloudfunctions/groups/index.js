// Cloud function for group sharing
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// Generate random group code
function generateGroupCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Format date time (China timezone UTC+8)
function formatDateTime(date) {
  const chinaTime = new Date(date.getTime() + (8 * 60 * 60 * 1000));
  const month = (chinaTime.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = chinaTime.getUTCDate().toString().padStart(2, '0');
  const hours = chinaTime.getUTCHours().toString().padStart(2, '0');
  const minutes = chinaTime.getUTCMinutes().toString().padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}`;
}

exports.main = async (event, context) => {
  const { action, data } = event;
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  try {
    switch (action) {
      case 'create':
        return await createGroup(data, openid);
      case 'join':
        return await joinGroup(data, openid);
      case 'list':
        return await getGroupList(openid);
      case 'get':
        return await getGroupDetail(data, openid);
      case 'addNote':
        return await addGroupNote(data, openid);
      case 'updateNote':
        return await updateGroupNote(data, openid);
      case 'deleteNote':
        return await deleteGroupNote(data, openid);
      case 'getNotes':
        return await getGroupNotes(data, openid);
      case 'leave':
        return await leaveGroup(data, openid);
      case 'kick':
        return await kickMember(data, openid);
      case 'history':
        return await getGroupHistory(openid);
      case 'rejoin':
        return await rejoinGroup(data, openid);
      case 'delete':
        return await deleteGroup(data, openid);
      case 'addTodo':
        return await addGroupTodo(data, openid);
      case 'getTodos':
        return await getGroupTodos(data, openid);
      case 'updateTodo':
        return await updateGroupTodo(data, openid);
      case 'deleteTodo':
        return await deleteGroupTodo(data, openid);
      case 'toggleTodo':
        return await toggleGroupTodo(data, openid);
      default:
        return { code: -1, message: 'Unknown action', data: null };
    }
  } catch (error) {
    return { code: -1, message: error.message, data: null };
  }
};

// Create a new group
async function createGroup(data, openid) {
  const { name } = data || {};
  
  if (!name) {
    return { code: -1, message: 'Group name is required', data: null };
  }

  const now = new Date();
  const groupCode = generateGroupCode();
  
  const result = await db.collection('groups').add({
    data: {
      name: name,
      code: groupCode,
      creator: openid,
      members: [openid],
      createTime: now,
      updateTime: now
    }
  });

  return {
    code: 0,
    message: 'success',
    data: {
      id: result._id,
      code: groupCode,
      name: name
    }
  };
}

// Join a group by code
async function joinGroup(data, openid) {
  const { code } = data || {};
  
  if (!code) {
    return { code: -1, message: 'Group code is required', data: null };
  }

  const group = await db.collection('groups').where({
    code: code.toUpperCase()
  }).get();

  if (!group.data || group.data.length === 0) {
    return { code: -1, message: 'Group not found', data: null };
  }

  const groupData = group.data[0];
  
  // Check if already a member
  if (groupData.members.includes(openid)) {
    return { code: -1, message: 'Already a member of this group', data: null };
  }

  // Add member
  await db.collection('groups').doc(groupData._id).update({
    data: {
      members: _.push(openid),
      updateTime: new Date()
    }
  });

  return {
    code: 0,
    message: 'success',
    data: {
      id: groupData._id,
      name: groupData.name,
      code: groupData.code
    }
  };
}

// Get user's group list
async function getGroupList(openid) {
  const groups = await db.collection('groups').where({
    members: _.all([openid])
  }).orderBy('updateTime', 'desc').get();

  return {
    code: 0,
    message: 'success',
    data: {
      list: groups.data || []
    }
  };
}

// Get group detail
async function getGroupDetail(data, openid) {
  const { id } = data || {};
  
  if (!id) {
    return { code: -1, message: 'Group ID is required', data: null };
  }

  const group = await db.collection('groups').doc(id).get();
  
  if (!group.data) {
    return { code: -1, message: 'Group not found', data: null };
  }

  // Check if user is a member
  if (!group.data.members.includes(openid)) {
    return { code: -1, message: 'No permission', data: null };
  }

  return {
    code: 0,
    message: 'success',
    data: group.data
  };
}

// Add note to group
async function addGroupNote(data, openid) {
  const { groupId, title, content, color = '#ffffff' } = data || {};
  
  if (!groupId || !content) {
    return { code: -1, message: 'Group ID and content are required', data: null };
  }

  // Check if user is a member
  const group = await db.collection('groups').doc(groupId).get();
  if (!group.data || !group.data.members.includes(openid)) {
    return { code: -1, message: 'No permission', data: null };
  }

  const now = new Date();
  const result = await db.collection('group_notes').add({
    data: {
      groupId: groupId,
      title: title || '',
      content: content,
      color: color,
      author: openid,
      createTime: now,
      updateTime: now,
      createTimeStr: formatDateTime(now)
    }
  });

  // Update group updateTime
  await db.collection('groups').doc(groupId).update({
    data: { updateTime: now }
  });

  return {
    code: 0,
    message: 'success',
    data: { id: result._id }
  };
}

// Update group note
async function updateGroupNote(data, openid) {
  const { id, title, content, color } = data || {};
  
  if (!id) {
    return { code: -1, message: 'Note ID is required', data: null };
  }

  const note = await db.collection('group_notes').doc(id).get();
  if (!note.data) {
    return { code: -1, message: 'Note not found', data: null };
  }

  // Check if user is a member of the group
  const group = await db.collection('groups').doc(note.data.groupId).get();
  if (!group.data || !group.data.members.includes(openid)) {
    return { code: -1, message: 'No permission', data: null };
  }

  const updateData = { updateTime: new Date() };
  if (title !== undefined) updateData.title = title;
  if (content !== undefined) updateData.content = content;
  if (color !== undefined) updateData.color = color;

  await db.collection('group_notes').doc(id).update({ data: updateData });

  return { code: 0, message: 'success', data: null };
}

// Delete group note
async function deleteGroupNote(data, openid) {
  const { id } = data || {};
  
  if (!id) {
    return { code: -1, message: 'Note ID is required', data: null };
  }

  const note = await db.collection('group_notes').doc(id).get();
  if (!note.data) {
    return { code: -1, message: 'Note not found', data: null };
  }

  // Check if user is a member of the group
  const group = await db.collection('groups').doc(note.data.groupId).get();
  if (!group.data || !group.data.members.includes(openid)) {
    return { code: -1, message: 'No permission', data: null };
  }

  await db.collection('group_notes').doc(id).remove();

  return { code: 0, message: 'success', data: null };
}

// Get group notes
async function getGroupNotes(data, openid) {
  const { groupId } = data || {};
  
  if (!groupId) {
    return { code: -1, message: 'Group ID is required', data: null };
  }

  // Check if user is a member
  const group = await db.collection('groups').doc(groupId).get();
  if (!group.data || !group.data.members.includes(openid)) {
    return { code: -1, message: 'No permission', data: null };
  }

  const notes = await db.collection('group_notes').where({
    groupId: groupId
  }).orderBy('createTime', 'desc').get();

  return {
    code: 0,
    message: 'success',
    data: {
      list: notes.data || []
    }
  };
}

// Leave group
async function leaveGroup(data, openid) {
  const { groupId } = data || {};
  
  if (!groupId) {
    return { code: -1, message: 'Group ID is required', data: null };
  }

  const group = await db.collection('groups').doc(groupId).get();
  if (!group.data) {
    return { code: -1, message: 'Group not found', data: null };
  }

  // Check if user is a member
  if (!group.data.members.includes(openid)) {
    return { code: -1, message: 'Not a member of this group', data: null };
  }

  // Remove member
  const newMembers = group.data.members.filter(m => m !== openid);
  
  // Save to history for rejoin
  await db.collection('group_history').add({
    data: {
      groupId: groupId,
      userOpenid: openid,
      groupName: group.data.name,
      groupCode: group.data.code,
      leaveTime: new Date()
    }
  });

  // Update group members (never delete, even if creator leaves)
  await db.collection('groups').doc(groupId).update({
    data: {
      members: newMembers,
      updateTime: new Date()
    }
  });

  return { code: 0, message: 'success', data: null };
}

// Kick member (only creator can do this)
async function kickMember(data, openid) {
  const { groupId, memberOpenid } = data || {};
  
  if (!groupId || !memberOpenid) {
    return { code: -1, message: 'Group ID and member OpenID are required', data: null };
  }

  const group = await db.collection('groups').doc(groupId).get();
  if (!group.data) {
    return { code: -1, message: 'Group not found', data: null };
  }

  // Check if user is creator
  if (group.data.creator !== openid) {
    return { code: -1, message: 'Only creator can kick members', data: null };
  }

  // Cannot kick creator
  if (memberOpenid === group.data.creator) {
    return { code: -1, message: 'Cannot kick creator', data: null };
  }

  // Check if target is a member
  if (!group.data.members.includes(memberOpenid)) {
    return { code: -1, message: 'Target is not a member', data: null };
  }

  // Remove member
  const newMembers = group.data.members.filter(m => m !== memberOpenid);
  
  // Save to history for rejoin
  await db.collection('group_history').add({
    data: {
      groupId: groupId,
      userOpenid: memberOpenid,
      groupName: group.data.name,
      groupCode: group.data.code,
      leaveTime: new Date(),
      kickedBy: openid
    }
  });

  await db.collection('groups').doc(groupId).update({
    data: {
      members: newMembers,
      updateTime: new Date()
    }
  });

  return { code: 0, message: 'success', data: null };
}

// Get group history (groups user left)
async function getGroupHistory(openid) {
  const history = await db.collection('group_history').where({
    userOpenid: openid
  }).orderBy('leaveTime', 'desc').get();

  // Get unique groups (in case user joined/left multiple times)
  const uniqueGroups = [];
  const seenGroupIds = new Set();
  
  for (const item of history.data) {
    if (!seenGroupIds.has(item.groupId)) {
      seenGroupIds.add(item.groupId);
      
      // Check if group still exists and user is not currently a member
      const group = await db.collection('groups').doc(item.groupId).get();
      if (group.data && !group.data.members.includes(openid)) {
        uniqueGroups.push({
          ...item,
          groupInfo: group.data
        });
      }
    }
  }

  return {
    code: 0,
    message: 'success',
    data: {
      list: uniqueGroups
    }
  };
}

// Rejoin group using history
async function rejoinGroup(data, openid) {
  const { groupId } = data || {};
  
  if (!groupId) {
    return { code: -1, message: 'Group ID is required', data: null };
  }

  const group = await db.collection('groups').doc(groupId).get();
  if (!group.data) {
    return { code: -1, message: 'Group not found', data: null };
  }

  // Check if already a member
  if (group.data.members.includes(openid)) {
    return { code: -1, message: 'Already a member of this group', data: null };
  }

  // Add member back
  await db.collection('groups').doc(groupId).update({
    data: {
      members: _.push(openid),
      updateTime: new Date()
    }
  });

  return {
    code: 0,
    message: 'success',
    data: {
      id: groupId,
      name: group.data.name,
      code: group.data.code
    }
  };
}

// Delete group (only creator can delete)
async function deleteGroup(data, openid) {
  const { groupId } = data || {};
  
  if (!groupId) {
    return { code: -1, message: 'Group ID is required', data: null };
  }

  // Get group info
  const group = await db.collection('groups').doc(groupId).get();
  
  if (!group.data) {
    return { code: -1, message: 'Group not found', data: null };
  }

  // Check if user is creator
  if (group.data.creator !== openid) {
    return { code: -1, message: 'Only creator can delete group', data: null };
  }

  // Delete all group notes
  const notesRes = await db.collection('group_notes').where({
    groupId: groupId
  }).get();
  
  const deleteNoteTasks = notesRes.data.map(note => {
    return db.collection('group_notes').doc(note._id).remove();
  });
  await Promise.all(deleteNoteTasks);

  // Delete group history records
  const historyRes = await db.collection('group_history').where({
    groupId: groupId
  }).get();
  
  const deleteHistoryTasks = historyRes.data.map(record => {
    return db.collection('group_history').doc(record._id).remove();
  });
  await Promise.all(deleteHistoryTasks);

  // Delete group todos
  const todosRes = await db.collection('group_todos').where({
    groupId: groupId
  }).get();
  
  const deleteTodoTasks = todosRes.data.map(todo => {
    return db.collection('group_todos').doc(todo._id).remove();
  });
  await Promise.all(deleteTodoTasks);

  // Delete group
  await db.collection('groups').doc(groupId).remove();

  return { code: 0, message: 'success', data: null };
}

// Add group todo
async function addGroupTodo(data, openid) {
  const { groupId, content } = data || {};
  
  if (!groupId || !content) {
    return { code: -1, message: 'Group ID and content are required', data: null };
  }

  // Check if user is member
  const group = await db.collection('groups').doc(groupId).get();
  if (!group.data || !group.data.members.includes(openid)) {
    return { code: -1, message: 'Not a member of this group', data: null };
  }

  const now = new Date();
  const result = await db.collection('group_todos').add({
    data: {
      groupId: groupId,
      content: content,
      completed: false,
      creator: openid,
      createTime: now,
      updateTime: now
    }
  });

  return {
    code: 0,
    message: 'success',
    data: {
      id: result._id,
      content: content,
      createTimeStr: formatDateTime(now)
    }
  };
}

// Get group todos
async function getGroupTodos(data, openid) {
  const { groupId } = data || {};
  
  if (!groupId) {
    return { code: -1, message: 'Group ID is required', data: null };
  }

  // Check if user is member
  const group = await db.collection('groups').doc(groupId).get();
  if (!group.data || !group.data.members.includes(openid)) {
    return { code: -1, message: 'Not a member of this group', data: null };
  }

  const todos = await db.collection('group_todos').where({
    groupId: groupId
  }).orderBy('createTime', 'desc').get();

  const list = todos.data.map(todo => ({
    ...todo,
    createTimeStr: formatDateTime(todo.createTime)
  }));

  return { code: 0, message: 'success', data: { list } };
}

// Update group todo
async function updateGroupTodo(data, openid) {
  const { id, content } = data || {};
  
  if (!id || !content) {
    return { code: -1, message: 'Todo ID and content are required', data: null };
  }

  const todo = await db.collection('group_todos').doc(id).get();
  if (!todo.data) {
    return { code: -1, message: 'Todo not found', data: null };
  }

  // Check if user is member
  const group = await db.collection('groups').doc(todo.data.groupId).get();
  if (!group.data || !group.data.members.includes(openid)) {
    return { code: -1, message: 'Not a member of this group', data: null };
  }

  await db.collection('group_todos').doc(id).update({
    data: {
      content: content,
      updateTime: new Date()
    }
  });

  return { code: 0, message: 'success', data: null };
}

// Delete group todo
async function deleteGroupTodo(data, openid) {
  const { id } = data || {};
  
  if (!id) {
    return { code: -1, message: 'Todo ID is required', data: null };
  }

  const todo = await db.collection('group_todos').doc(id).get();
  if (!todo.data) {
    return { code: -1, message: 'Todo not found', data: null };
  }

  // Check if user is member
  const group = await db.collection('groups').doc(todo.data.groupId).get();
  if (!group.data || !group.data.members.includes(openid)) {
    return { code: -1, message: 'Not a member of this group', data: null };
  }

  await db.collection('group_todos').doc(id).remove();

  return { code: 0, message: 'success', data: null };
}

// Toggle group todo completed status
async function toggleGroupTodo(data, openid) {
  const { id, completed } = data || {};
  
  if (!id || completed === undefined) {
    return { code: -1, message: 'Todo ID and completed status are required', data: null };
  }

  const todo = await db.collection('group_todos').doc(id).get();
  if (!todo.data) {
    return { code: -1, message: 'Todo not found', data: null };
  }

  // Check if user is member
  const group = await db.collection('groups').doc(todo.data.groupId).get();
  if (!group.data || !group.data.members.includes(openid)) {
    return { code: -1, message: 'Not a member of this group', data: null };
  }

  await db.collection('group_todos').doc(id).update({
    data: {
      completed: completed,
      updateTime: new Date()
    }
  });

  return { code: 0, message: 'success', data: null };
}
