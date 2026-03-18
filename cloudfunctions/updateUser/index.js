// Cloud function to update user info
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { OPENID } = wxContext;
  const { nickName, avatarUrl } = event || {};
  
  if (!OPENID) {
    return { code: -1, message: 'Not logged in', data: null };
  }
  
  try {
    // Find user
    const userRes = await db.collection('users').where({
      _openid: OPENID
    }).get();
    
    if (userRes.data.length === 0) {
      return { code: -1, message: 'User not found', data: null };
    }
    
    const userId = userRes.data[0]._id;
    const updateData = {
      updateTime: new Date()
    };
    
    if (nickName !== undefined) updateData.nickName = nickName;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
    
    // Update user info
    await db.collection('users').doc(userId).update({
      data: updateData
    });
    
    return {
      code: 0,
      message: 'User info updated',
      data: {
        openid: OPENID,
        nickName: nickName,
        avatarUrl: avatarUrl
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
