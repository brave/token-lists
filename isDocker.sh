if [ -f /.dockerenv ];
    then
        echo "Running on a docker instance"
    else
        echo "Not a docker instance"
        if [ $ACTIONS_OR_CI_BUILD ];
            then
                echo "Actions or CI instance"
            else
                exit 1
        fi
fi
