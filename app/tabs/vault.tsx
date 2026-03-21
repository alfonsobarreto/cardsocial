import React from 'react';
import { Swipeable } from 'react-native-gesture-handler';

export default function Vault() {
  return (
    <Swipeable
      renderRightActions={() => null}
      renderLeftActions={() => null}
    >
      {/* ...existing code... */}
    </Swipeable>
  );
}