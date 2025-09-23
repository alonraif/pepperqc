import React from 'react';

const ColorModeContext = React.createContext({
  mode: 'dark',
  toggleColorMode: () => {},
});

export default ColorModeContext;
