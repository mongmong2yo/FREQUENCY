import {handleFrequencyRequest} from '../server/public-api.mjs';

export default {
  fetch(request) {
    return handleFrequencyRequest(request);
  },
};
