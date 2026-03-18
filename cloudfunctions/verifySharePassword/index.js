// Cloud function to verify share password and return shared notes
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// Main entry function
exports.main = async (event, context) => {
  const { password } = event;
  
  try {
    // Validate password
    if (!password) {
      return {
        code: -1,
        message: 'Password is required',
        data: null
      };
    }
    
    // Query shared notes with matching password
    const result = await db.collection('notes')
      .where({
        shared: true,
        sharePassword: password,
        isDeleted: _.neq(true)
      })
      .orderBy('createTime', 'desc')
      .get();
    
    // Get author info for each note
    const notesWithAuthor = await Promise.all(result.data.map(async note => {
      const authorOpenid = note._openid;
      const userRes = await db.collection('users').where({
        _openid: authorOpenid
      }).get();
      
      const userInfo = userRes.data.length > 0 ? userRes.data[0] : null;
      
      return {
        ...note,
        authorName: userInfo ? userInfo.nickName : '用户',
        authorAvatar: userInfo ? userInfo.avatarUrl : ''
      };
    }));
    
    return {
      code: 0,
      message: 'success',
      data: {
        notes: notesWithAuthor,
        count: notesWithAuthor.length
      }
    };
    
  } catch (error) {
    return {
      code: -1,
      message: error.message,
      data: null
    };
  }
};

