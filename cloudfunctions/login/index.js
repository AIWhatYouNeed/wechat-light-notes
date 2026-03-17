// Cloud function for user login
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

// Main entry function
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { OPENID, APPID, UNIONID } = wxContext;
  
  const db = cloud.database();
  
  try {
    // Check if user exists
    const userResult = await db.collection('users').where({
      _openid: OPENID
    }).get();
    
    let userInfo;
    
    if (userResult.data.length === 0) {
      // New user, create record
      const now = new Date();
      const result = await db.collection('users').add({
        data: {
          _openid: OPENID,
          appid: APPID,
          unionid: UNIONID,
          createTime: now,
          updateTime: now,
          nickName: '',
          avatarUrl: ''
        }
      });
      
      userInfo = {
        _id: result._id,
        _openid: OPENID,
        nickName: '',
        avatarUrl: ''
      };
    } else {
      // Existing user
      userInfo = userResult.data[0];
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
