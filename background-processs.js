function runBackgroundProcess() {
    setInterval(() => {
      console.log('Background process is running');
    }, 1000);
  }
  
  runBackgroundProcess();