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
      case 'getJoinRequests':
        return await getJoinRequests(data, openid);
      case 'approveJoin':
        return await approveJoinRequest(data, openid);
      case 'rejectJoin':
        return await rejectJoinRequest(data, openid);
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

  // Check if user was previously kicked from this group
  // Query all history records for this user and group
  const historyRes = await db.collection('group_history').where({
    groupId: groupData._id,
    userOpenid: openid
  }).get();
  
  console.log('History query result count:', historyRes.data.length);
  console.log('History data:', JSON.stringify(historyRes.data));
  
  // Check if any record has kickedBy field (meaning user was kicked)
  let wasKicked = false;
  for (const record of historyRes.data) {
    console.log('Checking record:', record._id, 'kickedBy:', record.kickedBy);
    if (record.kickedBy) {
      wasKicked = true;
      break;
    }
  }
  
  console.log('Was kicked:', wasKicked);

  if (wasKicked) {
    // User was kicked, need creator approval
    // Check if there's already a pending request
    const existingRequest = await db.collection('join_requests').where({
      groupId: groupData._id,
      userOpenid: openid,
      status: 'pending'
    }).get();

    if (existingRequest.data.length > 0) {
      return { code: -1, message: 'Join request already pending', data: null };
    }

    // Create join request
    const userRes = await db.collection('users').where({ _openid: openid }).get();
    const userInfo = userRes.data.length > 0 ? userRes.data[0] : null;

    await db.collection('join_requests').add({
      data: {
        groupId: groupData._id,
        groupName: groupData.name,
        userOpenid: openid,
        userName: userInfo ? userInfo.nickName : '用户',
        userAvatar: userInfo ? userInfo.avatarUrl : '',
        status: 'pending',
        createTime: new Date()
      }
    });

    return {
      code: 1,
      message: 'Join request sent, waiting for creator approval',
      data: {
        id: groupData._id,
        name: groupData.name,
        code: groupData.code
      }
    };
  }

  // Add member directly (not kicked before)
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

  // Get member details from users collection
  const memberDetails = [];
  for (const memberOpenid of group.data.members) {
    const userRes = await db.collection('users').where({
      _openid: memberOpenid
    }).get();
    
    if (userRes.data.length > 0) {
      memberDetails.push({
        openid: memberOpenid,
        nickName: userRes.data[0].nickName || '用户',
        avatarUrl: userRes.data[0].avatarUrl || ''
      });
    } else {
      memberDetails.push({
        openid: memberOpenid,
        nickName: '用户',
        avatarUrl: ''
      });
    }
  }

  return {
    code: 0,
    message: 'success',
    data: {
      ...group.data,
      memberDetails: memberDetails
    }
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

  // Get user info
  const userRes = await db.collection('users').where({ _openid: openid }).get();
  const userInfo = userRes.data.length > 0 ? userRes.data[0] : null;

  const now = new Date();
  const result = await db.collection('group_notes').add({
    data: {
      groupId: groupId,
      title: title || '',
      content: content,
      color: color,
      author: openid,
      authorName: userInfo ? userInfo.nickName : '用户',
      authorAvatar: userInfo ? userInfo.avatarUrl : '',
      createTime: now,
      updateTime: now,
      createTimeStr: formatDateTime(now),
      updateTimeStr: formatDateTime(now),
      history: [{
        action: 'create',
        operator: openid,
        operatorName: userInfo ? userInfo.nickName : '用户',
        time: now,
        timeStr: formatDateTime(now)
      }]
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

  // Get user info
  const userRes = await db.collection('users').where({ _openid: openid }).get();
  const userInfo = userRes.data.length > 0 ? userRes.data[0] : null;

  const now = new Date();
  const updateData = { 
    updateTime: now,
    updateTimeStr: formatDateTime(now)
  };
  if (title !== undefined) updateData.title = title;
  if (content !== undefined) updateData.content = content;
  if (color !== undefined) updateData.color = color;

  // Add history record
  const historyItem = {
    action: 'update',
    operator: openid,
    operatorName: userInfo ? userInfo.nickName : '用户',
    time: now,
    timeStr: formatDateTime(now)
  };

  await db.collection('group_notes').doc(id).update({ 
    data: {
      ...updateData,
      history: _.push(historyItem)
    }
  });

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

  // Check if user was previously kicked from this group
  const historyRes = await db.collection('group_history').where({
    groupId: groupId,
    userOpenid: openid
  }).get();
  
  // Check if any record has kickedBy field (meaning user was kicked)
  let wasKicked = false;
  for (const record of historyRes.data) {
    if (record.kickedBy) {
      wasKicked = true;
      break;
    }
  }

  if (wasKicked) {
    // Check if there's already a pending request
    const existingRequest = await db.collection('join_requests').where({
      groupId: groupId,
      userOpenid: openid,
      status: 'pending'
    }).get();

    if (existingRequest.data.length > 0) {
      return { code: -1, message: 'Join request already pending', data: null };
    }

    // Create join request
    const userRes = await db.collection('users').where({ _openid: openid }).get();
    const userInfo = userRes.data.length > 0 ? userRes.data[0] : null;

    await db.collection('join_requests').add({
      data: {
        groupId: groupId,
        groupName: group.data.name,
        userOpenid: openid,
        userName: userInfo ? userInfo.nickName : '用户',
        userAvatar: userInfo ? userInfo.avatarUrl : '',
        status: 'pending',
        createTime: new Date()
      }
    });

    return {
      code: 1,
      message: 'Join request sent, waiting for creator approval',
      data: {
        id: groupId,
        name: group.data.name,
        code: group.data.code
      }
    };
  }

  // Add member back (only if not kicked)
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

  // Get user info
  const userRes = await db.collection('users').where({ _openid: openid }).get();
  const userInfo = userRes.data.length > 0 ? userRes.data[0] : null;

  const now = new Date();
  const result = await db.collection('group_todos').add({
    data: {
      groupId: groupId,
      content: content,
      completed: false,
      creator: openid,
      creatorName: userInfo ? userInfo.nickName : '用户',
      creatorAvatar: userInfo ? userInfo.avatarUrl : '',
      createTime: now,
      updateTime: now,
      createTimeStr: formatDateTime(now),
      updateTimeStr: formatDateTime(now),
      history: [{
        action: 'create',
        operator: openid,
        operatorName: userInfo ? userInfo.nickName : '用户',
        time: now,
        timeStr: formatDateTime(now)
      }]
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

  // Get user info
  const userRes = await db.collection('users').where({ _openid: openid }).get();
  const userInfo = userRes.data.length > 0 ? userRes.data[0] : null;

  const now = new Date();

  // Add history record
  const historyItem = {
    action: 'update',
    operator: openid,
    operatorName: userInfo ? userInfo.nickName : '用户',
    time: now,
    timeStr: formatDateTime(now)
  };

  await db.collection('group_todos').doc(id).update({
    data: {
      content: content,
      updateTime: now,
      updateTimeStr: formatDateTime(now),
      history: _.push(historyItem)
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

  // Get user info
  const userRes = await db.collection('users').where({ _openid: openid }).get();
  const userInfo = userRes.data.length > 0 ? userRes.data[0] : null;

  const now = new Date();

  // Add history record
  const historyItem = {
    action: completed ? 'complete' : 'uncomplete',
    operator: openid,
    operatorName: userInfo ? userInfo.nickName : '用户',
    time: now,
    timeStr: formatDateTime(now)
  };

  await db.collection('group_todos').doc(id).update({
    data: {
      completed: completed,
      updateTime: now,
      updateTimeStr: formatDateTime(now),
      history: _.push(historyItem)
    }
  });

  return { code: 0, message: 'success', data: null };
}

// Get join requests (for creator)
async function getJoinRequests(data, openid) {
  const { groupId } = data || {};
  
  if (!groupId) {
    return { code: -1, message: 'Group ID is required', data: null };
  }

  const group = await db.collection('groups').doc(groupId).get();
  if (!group.data) {
    return { code: -1, message: 'Group not found', data: null };
  }

  // Only creator can see join requests
  if (group.data.creator !== openid) {
    return { code: -1, message: 'Only creator can view join requests', data: null };
  }

  const requests = await db.collection('join_requests').where({
    groupId: groupId,
    status: 'pending'
  }).orderBy('createTime', 'desc').get();

  return {
    code: 0,
    message: 'success',
    data: {
      list: requests.data || []
    }
  };
}

// Approve join request
async function approveJoinRequest(data, openid) {
  const { requestId } = data || {};
  
  if (!requestId) {
    return { code: -1, message: 'Request ID is required', data: null };
  }

  const request = await db.collection('join_requests').doc(requestId).get();
  if (!request.data) {
    return { code: -1, message: 'Request not found', data: null };
  }

  const requestData = request.data;

  // Check if user is creator of the group
  const group = await db.collection('groups').doc(requestData.groupId).get();
  if (!group.data) {
    return { code: -1, message: 'Group not found', data: null };
  }

  if (group.data.creator !== openid) {
    return { code: -1, message: 'Only creator can approve requests', data: null };
  }

  // Add member to group
  await db.collection('groups').doc(requestData.groupId).update({
    data: {
      members: _.push(requestData.userOpenid),
      updateTime: new Date()
    }
  });

  // Update request status
  await db.collection('join_requests').doc(requestId).update({
    data: {
      status: 'approved',
      updateTime: new Date()
    }
  });

  return { code: 0, message: 'Join request approved', data: null };
}

// Reject join request
async function rejectJoinRequest(data, openid) {
  const { requestId } = data || {};
  
  if (!requestId) {
    return { code: -1, message: 'Request ID is required', data: null };
  }

  const request = await db.collection('join_requests').doc(requestId).get();
  if (!request.data) {
    return { code: -1, message: 'Request not found', data: null };
  }

  const requestData = request.data;

  // Check if user is creator of the group
  const group = await db.collection('groups').doc(requestData.groupId).get();
  if (!group.data) {
    return { code: -1, message: 'Group not found', data: null };
  }

  if (group.data.creator !== openid) {
    return { code: -1, message: 'Only creator can reject requests', data: null };
  }

  // Update request status
  await db.collection('join_requests').doc(requestId).update({
    data: {
      status: 'rejected',
      updateTime: new Date()
    }
  });

  return { code: 0, message: 'Join request rejected', data: null };
}
