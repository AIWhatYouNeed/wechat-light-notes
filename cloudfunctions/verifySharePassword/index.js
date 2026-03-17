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
    
    return {
      code: 0,
      message: 'success',
      data: {
        notes: result.data,
        count: result.data.length
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

