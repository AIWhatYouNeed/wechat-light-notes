// Cloud function for user login
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

// Main entry function
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { OPENID, APPID, UNIONID } = wxContext;
  const { nickName, avatarUrl } = event || {};
  
  const db = cloud.database();
  
  try {
    // Check if user exists
    const userResult = await db.collection('users').where({
      _openid: OPENID
    }).get();
    
    let userInfo;
    const now = new Date();
    
    if (userResult.data.length === 0) {
      // New user, create record
      const result = await db.collection('users').add({
        data: {
          _openid: OPENID,
          appid: APPID,
          unionid: UNIONID,
          createTime: now,
          updateTime: now,
          nickName: nickName || '',
          avatarUrl: avatarUrl || ''
        }
      });
      
      userInfo = {
        _id: result._id,
        _openid: OPENID,
        nickName: nickName || '',
        avatarUrl: avatarUrl || ''
      };
    } else {
      // Existing user - update info if provided
      userInfo = userResult.data[0];
      
      if (nickName || avatarUrl) {
        const updateData = {
          updateTime: now
        };
        if (nickName) updateData.nickName = nickName;
        if (avatarUrl) updateData.avatarUrl = avatarUrl;
        
        await db.collection('users').doc(userInfo._id).update({
          data: updateData
        });
        
        // Update local userInfo
        if (nickName) userInfo.nickName = nickName;
        if (avatarUrl) userInfo.avatarUrl = avatarUrl;
      }
    }
    
    return {
      code: 0,
      message: 'Login success',
      data: {
        openid: OPENID,
        appid: APPID,
        unionid: UNIONID,
        userInfo: userInfo
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
