# Python code with SonarLint issues

import os
import sys  # S1128: Unused import

# S2068: Hard-coded password
DB_CONNECTION = "postgresql://admin:password123@localhost:5432/mydb"

def get_user(user_id):
    # S5852: Regex with super-linear backoff
    import re
    pattern = re.compile(r"(a+)+$")

    # S1481: Unused local variable
    unused_result = "hello"

    # S3776: Cognitive complexity
    if user_id > 0:
        if user_id < 100:
            if user_id != 42:
                if user_id % 2 == 0:
                    return {"id": user_id, "type": "even"}
                else:
                    return {"id": user_id, "type": "odd"}
            else:
                return {"id": 42, "type": "special"}
        else:
            return None
    else:
        return None


def process_input(data):
    # S1066: Collapsible if
    if data is not None:
        if len(data) > 0:
            return data.strip()
    return ""


# S905: Boolean expression used as statement
def check_status(status):
    status == "active"
    return True
