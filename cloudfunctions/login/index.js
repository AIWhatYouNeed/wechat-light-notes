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
      // Existing user - NEVER update with WeChat info, preserve user's custom settings
      userInfo = userResult.data[0];
      console.log('Existing user found:', userInfo);
      
      // Check current custom settings
      const hasCustomNickName = userInfo.nickName && userInfo.nickName.trim() !== '';
      const hasCustomAvatar = userInfo.avatarUrl && userInfo.avatarUrl.trim() !== '';
      
      console.log('Current custom nickname:', hasCustomNickName, 'Value:', userInfo.nickName);
      console.log('Current custom avatar:', hasCustomAvatar, 'Value:', userInfo.avatarUrl);
      console.log('Ignored WeChat info - nickName:', nickName, 'avatarUrl:', avatarUrl);
      
      // IMPORTANT: For existing users, we NEVER update nickname/avatar from WeChat
      // User must explicitly update their profile in the app
      // Only update the login timestamp
      await db.collection('users').doc(userInfo._id).update({
        data: { updateTime: now }
      });
      
      console.log('User login time updated, profile preserved');
    }
    
    // Ensure we return the correct user info fields
    const returnUserInfo = {
      _id: userInfo._id,
      _openid: OPENID,
      nickName: userInfo.nickName || '',
      avatarUrl: userInfo.avatarUrl || ''
    };
    
    console.log('Returning user info:', returnUserInfo);
    
    return {
      code: 0,
      message: 'Login success',
      data: {
        openid: OPENID,
        appid: APPID,
        unionid: UNIONID,
        userInfo: returnUserInfo
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
