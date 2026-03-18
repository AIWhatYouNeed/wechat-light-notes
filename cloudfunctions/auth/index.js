// Cloud function for access password verification
const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// Default access password - you should change this!
const DEFAULT_PASSWORD = 'suibianji2024';

exports.main = async (event, context) => {
  const { password } = event;
  
  if (!password) {
    return {
      code: -1,
      message: 'Password is required',
      data: null
    };
  }

  try {
    // Try to get custom password from database
    const configRes = await db.collection('app_config').doc('access_password').get();
    const storedPassword = configRes.data ? configRes.data.value : null;
    
    // Use stored password or default password
    const correctPassword = storedPassword || DEFAULT_PASSWORD;
    
    if (password === correctPassword) {
      return {
        code: 0,
        message: 'Authentication successful',
        data: null
      };
    } else {
      return {
        code: -1,
        message: '密码错误',
        data: null
      };
    }
  } catch (error) {
    // If config not found, use default password
    if (password === DEFAULT_PASSWORD) {
      return {
        code: 0,
        message: 'Authentication successful',
        data: null
      };
    } else {
      return {
        code: -1,
        message: '密码错误',
        data: null
      };
    }
  }
};
