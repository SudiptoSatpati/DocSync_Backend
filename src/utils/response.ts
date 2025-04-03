export const sendResponse = (
    res: any, 
    status: number, 
    data: any = null, 
    msg: string = ''
  ) => {
    res.status(status).json({ status, data, msg });
  };
  